import { Duration, type RemovalPolicy } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { FilterCriteria, StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource, SqsDlq } from 'aws-cdk-lib/aws-lambda-event-sources';
import type { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { STREAM_FILTER_PATTERNS } from '@provisioning/api/infra';
import { PortalFunction } from './portal-function';
import { SEARCH_INDEX } from './search';

export interface StreamConsumersProps {
  table: ITableV2;
  searchEndpoint: string;
  wsManagementEndpoint: string;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/**
 * The two DynamoDB Streams consumers. Each event source mapping only invokes
 * its Lambda for matching items (STREAM_FILTER_PATTERNS), splits a failing
 * batch to isolate the bad record, and sends what still fails to a DLQ so the
 * shard keeps moving.
 */
export class StreamConsumers extends Construct {
  readonly searchIndexer: PortalFunction<'searchIndexer'>;
  readonly orderNotifier: PortalFunction<'orderNotifier'>;
  readonly searchIndexerDlq: Queue;
  readonly orderNotifierDlq: Queue;

  constructor(scope: Construct, id: string, props: StreamConsumersProps) {
    super(scope, id);
    const common = { logRetention: props.logRetention, removalPolicy: props.removalPolicy };

    this.searchIndexer = new PortalFunction(this, 'SearchIndexer', {
      ...common,
      handler: 'searchIndexer',
      memorySize: 512,
      timeout: Duration.seconds(60),
      environment: {
        TABLE_NAME: props.table.tableName,
        OPENSEARCH_ENDPOINT: props.searchEndpoint,
        OPENSEARCH_SERVICE: 'es',
        OPENSEARCH_INDEX: SEARCH_INDEX,
      },
    });
    this.searchIndexerDlq = this.deadLetterQueue('SearchIndexerDlq', props.removalPolicy);
    this.searchIndexer.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 100,
        maxBatchingWindow: Duration.seconds(1),
        bisectBatchOnError: true,
        // Bulk writes are idempotent, so retrying is safe.
        retryAttempts: 5,
        maxRecordAge: Duration.hours(6),
        onFailure: new SqsDlq(this.searchIndexerDlq),
        filters: STREAM_FILTER_PATTERNS.searchIndexer.map((p) => FilterCriteria.filter(p)),
      }),
    );

    this.orderNotifier = new PortalFunction(this, 'OrderNotifier', {
      ...common,
      handler: 'orderNotifier',
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: props.table.tableName,
        WS_MANAGEMENT_ENDPOINT: props.wsManagementEndpoint,
      },
    });
    this.orderNotifierDlq = this.deadLetterQueue('OrderNotifierDlq', props.removalPolicy);
    this.orderNotifier.addEventSource(
      new DynamoEventSource(props.table, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        // Small batches, no batching window: these are live UI updates.
        batchSize: 25,
        bisectBatchOnError: true,
        retryAttempts: 2,
        // A live update older than this is no longer worth sending.
        maxRecordAge: Duration.minutes(5),
        onFailure: new SqsDlq(this.orderNotifierDlq),
        filters: STREAM_FILTER_PATTERNS.orderNotifier.map((p) => FilterCriteria.filter(p)),
      }),
    );
  }

  get functions() {
    return [this.searchIndexer, this.orderNotifier];
  }

  get deadLetterQueues() {
    return [this.searchIndexerDlq, this.orderNotifierDlq];
  }

  private deadLetterQueue(id: string, removalPolicy: RemovalPolicy): Queue {
    // Holds failed-batch metadata (shard, sequence numbers), not the records themselves.
    return new Queue(this, id, {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      removalPolicy,
    });
  }
}
