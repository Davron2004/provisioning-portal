import type {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import type { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@provisioning/contracts';
import { issueLocalToken } from '../auth/tokens';
import type { ConnectionsRepository } from '../data/connections-repository';
import { handler as authorize } from '../handlers/ws-authorizer';
import { ApiGatewaySender, type MessageSender } from './sender';
import { createWebSocketHandler, type WebSocketEvent } from './ws-routes';

const wsEvent = (routeKey: string, body?: string, authorizer?: Record<string, unknown>) =>
  ({
    requestContext: { routeKey, connectionId: 'conn-1', authorizer },
    body,
  }) as unknown as WebSocketEvent;

describe('WebSocket routes', () => {
  let sent: ServerMessage[];
  let connections: Record<'add' | 'remove' | 'subscribe' | 'unsubscribe', ReturnType<typeof vi.fn>>;
  let route: ReturnType<typeof createWebSocketHandler>;

  beforeEach(() => {
    sent = [];
    connections = {
      add: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      subscribe: vi.fn(async () => {}),
      unsubscribe: vi.fn(async () => {}),
    };
    const sender: MessageSender = {
      send: async (_id, message) => {
        sent.push(message);
        return 'sent';
      },
    };
    route = createWebSocketHandler({
      connections: connections as unknown as ConnectionsRepository,
      accounts: { get: async (id) => (id === 'acc_a' ? ({ id } as never) : null) },
      sender,
      now: () => new Date('2026-11-21T15:00:00.000Z'),
    });
  });

  it('records the authorized caller on $connect and refuses one without context', async () => {
    await expect(
      route(wsEvent('$connect', undefined, { email: 'admin@example.com' })),
    ).resolves.toEqual({
      statusCode: 200,
    });
    expect(connections.add).toHaveBeenCalledWith(
      'conn-1',
      { email: 'admin@example.com' },
      expect.any(Date),
    );
    await expect(route(wsEvent('$connect'))).resolves.toEqual({ statusCode: 401 });
  });

  it('subscribes to an account or to every account and confirms', async () => {
    await route(wsEvent('subscribe', JSON.stringify({ action: 'subscribe', accountId: 'acc_a' })));
    await route(wsEvent('$default', JSON.stringify({ action: 'subscribe', accountId: '*' })));
    expect(connections.subscribe.mock.calls.map((c) => c[1])).toEqual(['acc_a', '*']);
    expect(sent).toEqual([
      { type: 'subscribed', accountId: 'acc_a' },
      { type: 'subscribed', accountId: '*' },
    ]);
  });

  it('rejects unknown accounts and malformed messages without side effects', async () => {
    const unknown = await route(
      wsEvent('subscribe', JSON.stringify({ action: 'subscribe', accountId: 'acc_x' })),
    );
    expect(unknown).toMatchObject({ statusCode: 400 });
    expect(await route(wsEvent('$default', 'not json'))).toMatchObject({ statusCode: 400 });
    expect(await route(wsEvent('$default', JSON.stringify({ action: 'dance' })))).toMatchObject({
      statusCode: 400,
    });
    expect(connections.subscribe).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('answers ping, unsubscribes, and cleans up on $disconnect', async () => {
    await route(wsEvent('ping', JSON.stringify({ action: 'ping' })));
    await route(
      wsEvent('unsubscribe', JSON.stringify({ action: 'unsubscribe', accountId: 'acc_a' })),
    );
    await route(wsEvent('$disconnect'));
    expect(sent).toEqual([{ type: 'pong' }]);
    expect(connections.unsubscribe).toHaveBeenCalledWith('conn-1', 'acc_a');
    expect(connections.remove).toHaveBeenCalledWith('conn-1');
  });
});

describe('ws-authorizer (AUTH_MODE=local)', () => {
  const event = (token?: string) =>
    ({
      methodArn: 'arn:aws:execute-api:ca-central-1:1:api/prod/$connect',
      queryStringParameters: token ? { token } : null,
    }) as unknown as APIGatewayRequestAuthorizerEvent;

  beforeEach(() => {
    vi.stubEnv('AUTH_MODE', 'local');
  });

  it('allows a valid token and passes the caller on as context', async () => {
    const { idToken } = await issueLocalToken({
      id: 'u1',
      email: 'admin@example.com',
      name: 'Avery',
    });
    const result = await authorize(event(idToken));
    expect(result.principalId).toBe('u1');
    expect(result.policyDocument.Statement[0]).toMatchObject({
      Effect: 'Allow',
      Resource: 'arn:aws:execute-api:ca-central-1:1:api/prod/$connect',
    });
    expect(result.context).toEqual({ sub: 'u1', email: 'admin@example.com', name: 'Avery' });
  });

  it('answers Unauthorized for a missing or forged token', async () => {
    await expect(authorize(event())).rejects.toThrow('Unauthorized');
    await expect(authorize(event('a.b.c'))).rejects.toThrow('Unauthorized');
  });
});

describe('ApiGatewaySender', () => {
  const client = (send: (command: PostToConnectionCommand) => Promise<unknown>) =>
    new ApiGatewaySender({ send } as unknown as ApiGatewayManagementApiClient);

  it('posts the JSON message to the connection', async () => {
    const send = vi.fn(async (_command: PostToConnectionCommand) => ({}));
    await expect(client(send).send('c1', { type: 'pong' })).resolves.toBe('sent');
    const input = send.mock.calls[0]![0].input;
    expect(input.ConnectionId).toBe('c1');
    expect(new TextDecoder().decode(input.Data as Uint8Array)).toBe('{"type":"pong"}');
  });

  it('reports a gone connection instead of throwing', async () => {
    const gone = client(async () => {
      throw new GoneException({ message: 'gone', $metadata: {} });
    });
    await expect(gone.send('c1', { type: 'pong' })).resolves.toBe('gone');
    const broken = client(async () => {
      throw new Error('network');
    });
    await expect(broken.send('c1', { type: 'pong' })).rejects.toThrow('network');
  });
});
