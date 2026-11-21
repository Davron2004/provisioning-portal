import type { Page } from '@playwright/test';

interface OrderPush {
  type: string;
  order?: { id: string; status: string };
}

export interface OrderPushes {
  /** Statuses pushed for one order, in arrival order. */
  statusesOf(orderId: string): string[];
}

/**
 * Records the `order.updated` messages the page receives over its WebSocket, so
 * a test can show that a status reached the screen by push, not by a reload or a poll.
 * Must start before the page opens its socket: use the `orderPushes` fixture.
 */
export function recordOrderPushes(page: Page): OrderPushes {
  const pushes: { id: string; status: string }[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      try {
        const message = JSON.parse(payload.toString()) as OrderPush;
        if (message.type === 'order.updated' && message.order) {
          pushes.push({ id: message.order.id, status: message.order.status });
        }
      } catch {
        // Not JSON: not ours.
      }
    });
  });
  return {
    statusesOf: (orderId) => pushes.filter((p) => p.id === orderId).map((p) => p.status),
  };
}
