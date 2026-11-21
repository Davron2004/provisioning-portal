import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { requireEnv } from '../config/env';
import { AccountsRepository } from '../data/accounts-repository';
import { sharedDocumentClient } from '../data/client';
import { connectionsFromEnv, senderFromEnv } from '../realtime/from-env';
import { createWebSocketHandler, type WebSocketEvent } from '../realtime/ws-routes';

/** WebSocket API entry point: $connect, $disconnect and client messages (subscribe, unsubscribe, ping). */
let route: ReturnType<typeof createWebSocketHandler> | undefined;

export const handler = (event: WebSocketEvent): Promise<APIGatewayProxyResultV2> => {
  route ??= createWebSocketHandler({
    connections: connectionsFromEnv(),
    accounts: new AccountsRepository(sharedDocumentClient(), requireEnv('TABLE_NAME')),
    sender: senderFromEnv(),
    now: () => new Date(),
  });
  return route(event);
};
