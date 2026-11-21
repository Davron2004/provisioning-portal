import { describe, expect, it } from 'vitest';
import { Order, type ResolvedLine } from '@provisioning/contracts';
import { toSnapshot } from './snapshots';
import { testContext } from '../test-support/fixtures';
import {
  assignUserIds,
  completeLine,
  createOrder,
  failLine,
  finalizeOrder,
  recordTransientError,
  rejectLine,
  requestRetry,
  startLineAttempt,
  startProvisioning,
  startValidation,
} from './order-lifecycle';

const ctx = testContext();
const at = (s: number) => new Date(Date.UTC(2026, 10, 21, 15, 0, s));
const lines: ResolvedLine[] = [
  {
    action: 'add_user',
    user: { ...toSnapshot(ctx.users[0]!), email: 'new@test.example.com', extension: '2101' },
  },
  { action: 'remove_user', userId: 'u3', before: toSnapshot(ctx.users[2]!) },
];

const newOrder = () =>
  createOrder({
    id: 'ord_1',
    accountId: 'acc_test',
    accountName: 'Test Co',
    lines,
    siteNames: new Map([['site_k', 'Kanata Campus']]),
    source: 'manual',
    prompt: null,
    submittedBy: 'admin@example.com',
    now: at(0),
  });

describe('order lifecycle', () => {
  it('creates a submitted order with pending lines', () => {
    const order = newOrder();
    expect(() => Order.parse(order)).not.toThrow();
    expect(order).toMatchObject({
      status: 'submitted',
      title: 'Add 1 user, remove 1 user',
      completedAt: null,
    });
    expect(order.counts).toEqual({
      total: 2,
      pending: 2,
      provisioning: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(order.lines.map((l) => [l.lineId, l.userId])).toEqual([
      ['line-1', null],
      ['line-2', 'u3'],
    ]);
  });

  it('walks submitted -> validating -> provisioning -> failed, keeping counts and events in step', () => {
    const order = newOrder();
    startValidation(order, 2, at(1));
    assignUserIds(order, ['line-1', 'line-2'], () => 'usr_new');
    expect(order.lines[0]!.userId).toBe('usr_new');
    expect(order.lines[1]!.userId).toBe('u3');

    startProvisioning(order, 2, at(2));
    startLineAttempt(order, 'line-1', 'Creating extension on call server', at(3));
    expect(order.counts.provisioning).toBe(1);
    recordTransientError(order, 'line-1', 'Carrier API timed out', at(4));
    startLineAttempt(order, 'line-1', 'Creating extension on call server', at(6));
    completeLine(order, 'line-1', at(7));
    startLineAttempt(order, 'line-2', 'Deleting extension on call server', at(5));
    failLine(order, 'line-2', 'Call server refused', at(8));
    finalizeOrder(order, at(9));

    expect(order.status).toBe('failed');
    expect(order.completedAt).toBe(at(9).toISOString());
    expect(order.lines[0]).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      step: null,
      error: null,
    });
    expect(order.counts).toEqual({
      total: 2,
      pending: 0,
      provisioning: 0,
      succeeded: 1,
      failed: 1,
    });
    expect(order.events.map((e) => e.message)).toEqual([
      'Order submitted by admin@example.com',
      'Validating 2 lines',
      'Provisioning 2 lines',
      'Line 1 (Sofia Beaulieu): Carrier API timed out (attempt 1)',
      'Line 1 (Sofia Beaulieu) provisioned',
      'Line 2 (Mei Chen) failed: Call server refused',
      'Order failed: 1 of 2 lines failed',
    ]);
    expect(order.events.filter((e) => e.status).map((e) => e.status)).toEqual([
      'submitted',
      'validating',
      'provisioning',
      'failed',
    ]);
  });

  it('becomes active when every line succeeds', () => {
    const order = newOrder();
    for (const id of ['line-1', 'line-2']) completeLine(order, id, at(1));
    finalizeOrder(order, at(2));
    expect(order.status).toBe('active');
    expect(order.events.at(-1)!.message).toBe('Order completed: all 2 lines provisioned');
  });

  it('retries only failed lines and only from a failed order', () => {
    const order = newOrder();
    expect(() => requestRetry(order, 'ops@example.com', at(1))).toThrow(/only failed orders/);
    completeLine(order, 'line-1', at(1));
    rejectLine(order, 'line-2', 'Mei Chen is being changed by order ord_x', at(1));
    finalizeOrder(order, at(2));

    const retried = requestRetry(order, 'ops@example.com', at(3));
    expect(retried).toEqual(['line-2']);
    expect(order).toMatchObject({ status: 'provisioning', completedAt: null });
    expect(order.lines[1]).toMatchObject({ status: 'pending', error: null });
    expect(order.events.at(-1)!.message).toBe(
      'Retry of 1 failed line requested by ops@example.com',
    );
  });
});
