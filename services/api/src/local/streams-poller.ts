import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DescribeStreamCommand,
  DynamoDBStreamsClient,
  ExpiredIteratorException,
  GetRecordsCommand,
  GetShardIteratorCommand,
  type _Record as StreamRecord,
} from '@aws-sdk/client-dynamodb-streams';
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { matchesFilter } from '../streams/records';
import { log } from './log';

/**
 * LOCAL STAND-IN for Lambda's DynamoDB Streams event source mapping.
 * DynamoDB Local implements the Streams API, so this polls every shard,
 * converts records to the Lambda event shape, applies the same filter
 * patterns CDK configures, and invokes each consumer with a batch.
 *
 * Differences from AWS, on purpose: it starts at LATEST (seed data is
 * indexed by the reindex step, not replayed), a failed batch is logged and
 * skipped rather than retried, and there is no checkpointing across
 * restarts.
 */
export interface StreamConsumer {
  name: string;
  filterPatterns: readonly object[];
  handler: (event: DynamoDBStreamEvent) => Promise<unknown>;
}

export interface PollerOptions {
  endpoint: string;
  region: string;
  tableName: string;
  consumers: StreamConsumer[];
  intervalMs?: number;
  batchSize?: number;
}

export async function startStreamsPoller(options: PollerOptions): Promise<{ stop: () => void }> {
  const dynamo = new DynamoDBClient({ endpoint: options.endpoint, region: options.region });
  const streams = new DynamoDBStreamsClient({ endpoint: options.endpoint, region: options.region });
  const { Table } = await dynamo.send(new DescribeTableCommand({ TableName: options.tableName }));
  const streamArn = Table?.LatestStreamArn;
  if (!streamArn) throw new Error(`Table ${options.tableName} has no stream`);

  const intervalMs = options.intervalMs ?? 200;
  const iterators = new Map<string, string | undefined>();
  const finished = new Set<string>();
  let stopped = false;
  let firstDiscovery = true;

  const discoverShards = async () => {
    const { StreamDescription } = await streams.send(
      new DescribeStreamCommand({ StreamArn: streamArn }),
    );
    for (const shard of StreamDescription?.Shards ?? []) {
      const shardId = shard.ShardId!;
      if (iterators.has(shardId) || finished.has(shardId)) continue;
      // Shards that exist at startup are read from now on; shards that appear later from their start.
      const { ShardIterator } = await streams.send(
        new GetShardIteratorCommand({
          StreamArn: streamArn,
          ShardId: shardId,
          ShardIteratorType: firstDiscovery ? 'LATEST' : 'TRIM_HORIZON',
        }),
      );
      iterators.set(shardId, ShardIterator);
    }
    firstDiscovery = false;
  };

  const deliver = async (records: StreamRecord[]) => {
    const lambdaRecords = records.map((r) => toLambdaRecord(r, streamArn, options.region));
    for (const consumer of options.consumers) {
      const matching = lambdaRecords.filter((r) =>
        matchesFilter(r, consumer.filterPatterns as never),
      );
      if (matching.length === 0) continue;
      try {
        await consumer.handler({ Records: matching });
      } catch (error) {
        log.error(`${consumer.name} failed on a batch of ${matching.length} records`, error);
      }
    }
  };

  const pollOnce = async () => {
    await discoverShards();
    for (const [shardId, iterator] of iterators) {
      if (!iterator) {
        iterators.delete(shardId);
        finished.add(shardId);
        continue;
      }
      try {
        const result = await streams.send(
          new GetRecordsCommand({ ShardIterator: iterator, Limit: options.batchSize ?? 100 }),
        );
        iterators.set(shardId, result.NextShardIterator);
        if (result.Records && result.Records.length > 0) await deliver(result.Records);
      } catch (error) {
        if (!(error instanceof ExpiredIteratorException)) throw error;
        iterators.delete(shardId);
      }
    }
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await pollOnce();
      } catch (error) {
        log.error('stream polling failed; retrying', error);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };
  await discoverShards();
  void loop();
  return {
    stop: () => {
      stopped = true;
    },
  };
}

function toLambdaRecord(record: StreamRecord, streamArn: string, region: string): DynamoDBRecord {
  const created = record.dynamodb?.ApproximateCreationDateTime;
  return {
    eventID: record.eventID,
    eventName: record.eventName as DynamoDBRecord['eventName'],
    eventVersion: record.eventVersion ?? '1.1',
    eventSource: 'aws:dynamodb',
    awsRegion: region,
    eventSourceARN: streamArn,
    dynamodb: {
      ...(record.dynamodb as DynamoDBRecord['dynamodb']),
      ApproximateCreationDateTime: created
        ? Math.floor(new Date(created).getTime() / 1000)
        : undefined,
    },
  };
}
