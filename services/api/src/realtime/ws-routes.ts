import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { ALL_ACCOUNTS, ClientMessage } from '@provisioning/contracts';
import type { AccountsRepository } from '../data/accounts-repository';
import type { ConnectionsRepository } from '../data/connections-repository';
import { logger } from '../logger';
import type { MessageSender } from './sender';

/** A WebSocket event; on $connect API Gateway adds the Lambda authorizer's context. */
export type WebSocketEvent = APIGatewayProxyWebsocketEventV2 & {
  requestContext: APIGatewayProxyWebsocketEventV2['requestContext'] & {
    authorizer?: Record<string, unknown> | null;
  };
};

export interface WebSocketDeps {
  connections: ConnectionsRepository;
  accounts: Pick<AccountsRepository, 'get'>;
  sender: MessageSender;
  now: () => Date;
}

const ok = { statusCode: 200 };
const bad = (message: string) => ({ statusCode: 400, body: message });

/**
 * $connect / $disconnect / messages. The route selection expression is
 * `$request.body.action`; whether the API defines `subscribe`, `unsubscribe`
 * and `ping` routes or sends everything to `$default`, they all land here and
 * are told apart by the parsed message. Replies (`subscribed`, `pong`) go
 * back through the Management API, like order updates.
 */
export function createWebSocketHandler(deps: WebSocketDeps) {
  return async (event: WebSocketEvent): Promise<APIGatewayProxyResultV2> => {
    const { routeKey, connectionId } = event.requestContext;

    if (routeKey === '$connect') {
      const email = event.requestContext.authorizer?.email;
      if (typeof email !== 'string') return { statusCode: 401 };
      await deps.connections.add(connectionId, { email }, deps.now());
      logger.info('ws connected', { connectionId, email });
      return ok;
    }

    if (routeKey === '$disconnect') {
      await deps.connections.remove(connectionId);
      logger.info('ws disconnected', { connectionId });
      return ok;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.body ?? '');
    } catch {
      return bad('Messages must be JSON');
    }
    const message = ClientMessage.safeParse(parsed);
    if (!message.success) return bad('Unknown message');

    switch (message.data.action) {
      case 'subscribe': {
        const { accountId } = message.data;
        if (accountId !== ALL_ACCOUNTS && !(await deps.accounts.get(accountId))) {
          return bad(`Account ${accountId} was not found`);
        }
        await deps.connections.subscribe(connectionId, accountId, deps.now());
        await deps.sender.send(connectionId, { type: 'subscribed', accountId });
        return ok;
      }
      case 'unsubscribe':
        await deps.connections.unsubscribe(connectionId, message.data.accountId);
        return ok;
      case 'ping':
        await deps.sender.send(connectionId, { type: 'pong' });
        return ok;
    }
  };
}
