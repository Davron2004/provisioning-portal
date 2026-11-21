import { marshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { Order, ServerMessage } from '@provisioning/contracts';
import { orderItem } from '../data/items';
import { createOrder } from '../domain/order-lifecycle';
import { OrderNotifier } from './order-notifier';
import type { MessageSender } from './sender';

const baseOrder = (id: string, accountId: string): Order =>
  createOrder({
    id,
    accountId,
    accountName: 'Test Co',
    lines: [],
    siteNames: new Map(),
    source: 'manual',
    prompt: null,
    submittedBy: 'admin@example.com',
    now: new Date('2026-11-21T15:00:00.000Z'),
  });

const record = (
  item: Record<string, unknown>,
  eventName: DynamoDBRecord['eventName'] = 'MODIFY',
): DynamoDBRecord => ({
  eventName,
  dynamodb: {
    NewImage: marshall(item, { removeUndefinedValues: true }) as Record<string, AttributeValue>,
  },
});
const orderRecord = (order: Order, eventName?: DynamoDBRecord['eventName']) =>
  record(orderItem({ ...order, version: 1 }), eventName);

function setup(subscribers: Record<string, string[]>, gone: string[] = [], broken: string[] = []) {
  const sent: { connectionId: string; message: ServerMessage }[] = [];
  const sender: MessageSender = {
    send: async (connectionId, message) => {
      if (broken.includes(connectionId)) throw new Error('network');
      if (gone.includes(connectionId)) return 'gone';
      sent.push({ connectionId, message });
      return 'sent';
    },
  };
  const connections = {
    subscribersOf: vi.fn(async (accountId: string) => subscribers[accountId] ?? []),
    remove: vi.fn(async () => {}),
  };
  return { notifier: new OrderNotifier({ connections, sender }), sent, connections };
}

describe('OrderNotifier', () => {
  it('pushes the latest image of each order to its account subscribers', async () => {
    const { notifier, sent, connections } = setup({ acc_a: ['c1', 'c2'], acc_b: ['c3'] });
    const a1 = baseOrder('ord_a', 'acc_a');
    const a2 = { ...a1, status: 'validating' as const };
    const b = baseOrder('ord_b', 'acc_b');

    const result = await notifier.handle([
      orderRecord(a1, 'INSERT'),
      orderRecord(a2),
      orderRecord(b),
    ]);

    expect(result).toEqual({ orders: 2, sent: 3, gone: 0, failed: 0 });
    expect(sent.filter((s) => s.connectionId === 'c1').map((s) => s.message)).toEqual([
      { type: 'order.updated', order: a2 },
    ]);
    expect(sent.find((s) => s.connectionId === 'c3')?.message).toEqual({
      type: 'order.updated',
      order: b,
    });
    // Key attributes and the version never reach clients.
    expect(Object.keys((sent[0]!.message as { order: object }).order)).not.toContain('PK');
    expect(Object.keys((sent[0]!.message as { order: object }).order)).not.toContain('version');
    expect(connections.subscribersOf).toHaveBeenCalledTimes(2);
  });

  it('ignores removals and items that are not orders', async () => {
    const { notifier, sent } = setup({ acc_a: ['c1'] });
    const result = await notifier.handle([
      orderRecord(baseOrder('ord_a', 'acc_a'), 'REMOVE'),
      record({ PK: 'CONNECTION#c1', SK: 'CONNECTION', entity: 'Connection' }),
    ]);
    expect(result.orders).toBe(0);
    expect(sent).toEqual([]);
  });

  it('deletes connections API Gateway reports gone and survives send errors', async () => {
    const { notifier, connections } = setup(
      { acc_a: ['live', 'stale', 'broken'] },
      ['stale'],
      ['broken'],
    );
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await notifier.handle([orderRecord(baseOrder('ord_a', 'acc_a'))]);
    spy.mockRestore();
    expect(result).toEqual({ orders: 1, sent: 1, gone: 1, failed: 1 });
    expect(connections.remove).toHaveBeenCalledWith('stale');
    expect(connections.remove).toHaveBeenCalledTimes(1);
  });
});
