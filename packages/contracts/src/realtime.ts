import * as z from 'zod';
import { Order } from './orders';

/**
 * WebSocket protocol (API Gateway WebSocket API, route key = `action`).
 * Connect with `?token=<id token>`; the connection is authorized on $connect.
 */
export const ALL_ACCOUNTS = '*';

export const ClientMessage = z.discriminatedUnion('action', [
  /** Receive order updates for one account, or for every account with "*". */
  z.object({ action: z.literal('subscribe'), accountId: z.string() }),
  z.object({ action: z.literal('unsubscribe'), accountId: z.string() }),
  z.object({ action: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order.updated'), order: Order }),
  z.object({ type: z.literal('subscribed'), accountId: z.string() }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
