import type { DynamoDBRecord } from 'aws-lambda';
import type { Order } from '@provisioning/contracts';
import type { ConnectionsRepository } from '../data/connections-repository';
import { toOrder } from '../data/items';
import { Entity } from '../data/table';
import { logger } from '../logger';
import { entityOf, recordImage } from '../streams/records';
import type { MessageSender } from './sender';

export interface NotifierDeps {
  connections: Pick<ConnectionsRepository, 'subscribersOf' | 'remove'>;
  sender: MessageSender;
}

export interface NotifyResult {
  orders: number;
  sent: number;
  gone: number;
  failed: number;
}

/**
 * Turns order changes from the DynamoDB stream into `order.updated` pushes.
 * The stream's new image is the whole order, so no read is needed. Within a
 * batch only the latest image of each order is sent: a client that missed an
 * intermediate step still converges on the current state.
 *
 * Delivery is best effort. A connection API Gateway reports as gone is
 * deleted; other send errors are logged and do not fail the batch, because
 * retrying the batch would re-send to everyone else.
 */
export class OrderNotifier {
  constructor(private readonly deps: NotifierDeps) {}

  async handle(records: readonly DynamoDBRecord[]): Promise<NotifyResult> {
    const latest = new Map<string, Order>();
    for (const record of records) {
      if (record.eventName === 'REMOVE') continue;
      const image = recordImage(record);
      if (entityOf(image) !== Entity.Order) continue;
      const order = toOrder(image!);
      latest.set(order.id, order);
    }

    const result: NotifyResult = { orders: latest.size, sent: 0, gone: 0, failed: 0 };
    const subscribers = new Map<string, Promise<string[]>>();
    await Promise.all(
      [...latest.values()].map(async (order) => {
        if (!subscribers.has(order.accountId)) {
          subscribers.set(order.accountId, this.deps.connections.subscribersOf(order.accountId));
        }
        const connectionIds = await subscribers.get(order.accountId)!;
        await Promise.all(
          connectionIds.map(async (connectionId) => {
            try {
              const outcome = await this.deps.sender.send(connectionId, {
                type: 'order.updated',
                order,
              });
              if (outcome === 'gone') {
                result.gone += 1;
                await this.deps.connections.remove(connectionId);
              } else {
                result.sent += 1;
              }
            } catch (error) {
              result.failed += 1;
              logger.warn('push failed', { connectionId, orderId: order.id, error });
            }
          }),
        );
      }),
    );
    if (result.orders > 0) logger.info('order updates pushed', { ...result });
    return result;
  }
}
