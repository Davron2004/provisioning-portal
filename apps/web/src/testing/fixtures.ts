import { Order } from '@provisioning/contracts';

export function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_0001',
    accountId: 'acc_northwind',
    accountName: 'Northwind Dental',
    status: 'provisioning',
    source: 'manual',
    title: 'Add 2 users at Kanata Campus',
    counts: { total: 2, pending: 1, provisioning: 1, succeeded: 0, failed: 0 },
    submittedBy: 'admin@example.com',
    createdAt: '2026-11-21T14:00:00.000Z',
    updatedAt: '2026-11-21T14:01:00.000Z',
    completedAt: null,
    prompt: null,
    lines: [],
    events: [],
    ...overrides,
  };
}
