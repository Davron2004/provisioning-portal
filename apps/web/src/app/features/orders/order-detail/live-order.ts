import { Order, OrderLine, OrderStatus } from '@provisioning/contracts';

/**
 * The most recent of two versions of an order. Pushes and fetches race: a fetch that
 * started before a push can land after it, so the version with the later `updatedAt`
 * wins (the incoming one on a tie). A different order always replaces the current one.
 */
export function latestOrder(
  current: Order | undefined,
  incoming: Order | undefined,
): Order | undefined {
  if (!incoming) {
    return current;
  }
  if (!current || current.id !== incoming.id) {
    return incoming;
  }
  return incoming.updatedAt >= current.updatedAt ? incoming : current;
}

/**
 * What a retry will look like, shown at once while the request is on its way: the
 * failed lines go back to pending and the order to provisioning, as the API does.
 */
export function optimisticRetry(order: Order): Order {
  const lines = order.lines.map((line): OrderLine =>
    line.status === 'failed' ? { ...line, status: 'pending', error: null, step: null } : line,
  );
  return {
    ...order,
    status: 'provisioning',
    completedAt: null,
    lines,
    counts: {
      ...order.counts,
      pending: order.counts.pending + order.counts.failed,
      failed: 0,
    },
  };
}

/** Sentences for screen readers when the order's status changes. */
export function statusAnnouncement(order: Order): string {
  const { total, succeeded, failed } = order.counts;
  const messages: Record<OrderStatus, string> = {
    submitted: 'Order submitted.',
    validating: 'Validating the order.',
    provisioning: `Provisioning ${total} ${total === 1 ? 'line' : 'lines'}.`,
    active: `Order active: all ${total} ${total === 1 ? 'line' : 'lines'} provisioned.`,
    failed: `Order failed: ${failed} of ${total} ${total === 1 ? 'line' : 'lines'} failed, ${succeeded} succeeded.`,
  };
  return messages[order.status];
}
