import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBRecord } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConnectionsRepository } from '../data/connections-repository';
import { orderItem } from '../data/items';
import { createOrder } from '../domain/order-lifecycle';
import { STREAM_FILTER_PATTERNS } from '../streams/records';
import { createTestTable, dynamoEndpoint, type TestTable } from '../test-support/dynamo';
import { startStreamsPoller } from './streams-poller';

let table: TestTable;
beforeAll(async () => {
  table = await createTestTable();
});
afterAll(() => table?.drop());

const until = async (check: () => boolean, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for stream records');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('connections and the stream poller against DynamoDB Local', () => {
  it('tracks subscriptions per account and for every account, and removes them', async () => {
    const repo = new ConnectionsRepository(table.doc, table.tableName);
    const now = new Date();
    await repo.add('c1', { email: 'a@example.com' }, now);
    await repo.add('c2', { email: 'b@example.com' }, now);
    await repo.subscribe('c1', 'acc_a', now);
    await repo.subscribe('c1', 'acc_b', now);
    await repo.subscribe('c2', '*', now);

    expect((await repo.subscribersOf('acc_a')).sort()).toEqual(['c1', 'c2']);
    expect(await repo.subscribersOf('acc_c')).toEqual(['c2']);
    await repo.unsubscribe('c1', 'acc_a');
    expect(await repo.subscribersOf('acc_a')).toEqual(['c2']);
    await repo.remove('c1');
    expect(await repo.subscribersOf('acc_b')).toEqual(['c2']);
  });

  it('delivers matching records in the Lambda event shape', async () => {
    const received: DynamoDBRecord[] = [];
    const poller = await startStreamsPoller({
      endpoint: dynamoEndpoint(),
      region: 'ca-central-1',
      tableName: table.tableName,
      intervalMs: 50,
      consumers: [
        {
          name: 'test',
          filterPatterns: STREAM_FILTER_PATTERNS.orderNotifier,
          handler: async (event) => {
            received.push(...event.Records);
          },
        },
      ],
    });
    try {
      const order = createOrder({
        id: 'ord_stream',
        accountId: 'acc_a',
        accountName: 'A',
        lines: [],
        siteNames: new Map(),
        source: 'manual',
        prompt: null,
        submittedBy: 'admin@example.com',
        now: new Date(),
      });
      // A connection item is written too; the filter must drop it.
      await new ConnectionsRepository(table.doc, table.tableName).add(
        'c9',
        { email: 'x@example.com' },
        new Date(),
      );
      await table.doc.send(
        new PutCommand({ TableName: table.tableName, Item: orderItem({ ...order, version: 1 }) }),
      );

      await until(() => received.length > 0);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: { NewImage: { entity: { S: 'Order' }, id: { S: 'ord_stream' } } },
      });
      expect(received[0]!.eventSourceARN).toContain(table.tableName);
    } finally {
      poller.stop();
    }
  });
});
