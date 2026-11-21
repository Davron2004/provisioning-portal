import type { DynamoDBStreamEvent } from 'aws-lambda';
import { connectionsFromEnv, senderFromEnv } from '../../realtime/from-env';
import { OrderNotifier } from '../../realtime/order-notifier';

/**
 * DynamoDB Streams consumer (filtered to Order items, see
 * STREAM_FILTER_PATTERNS.orderNotifier): pushes `order.updated` to every
 * WebSocket connection subscribed to the order's account or to "*".
 */
let notifier: OrderNotifier | undefined;

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  notifier ??= new OrderNotifier({ connections: connectionsFromEnv(), sender: senderFromEnv() });
  await notifier.handle(event.Records);
};
