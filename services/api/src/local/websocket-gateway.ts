import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type {
  APIGatewayAuthorizerResult,
  APIGatewayProxyResultV2,
  APIGatewayRequestAuthorizerEvent,
} from 'aws-lambda';
import { WebSocketServer, type WebSocket } from 'ws';
import type { WebSocketEvent } from '../realtime/ws-routes';
import { log } from './log';
import { readBody, send } from './rest-gateway';

/**
 * LOCAL STAND-IN for the API Gateway WebSocket API, on one port:
 *  - WebSocket upgrades run the real `ws-authorizer.ts` handler (REQUEST
 *    authorizer, `?token=`), then `ws.ts` for $connect, every message and
 *    $disconnect, with API-Gateway-shaped events and connection ids;
 *  - `POST/GET/DELETE /@connections/{id}` emulate the Management API, so
 *    `order-notifier.ts` uses the real SDK client pointed here
 *    (WS_MANAGEMENT_ENDPOINT). Unknown ids get 410 GoneException.
 * Not emulated: idle timeouts, the two-hour limit, and frame size limits
 * (oversized messages are logged).
 */
export interface WebSocketGatewayOptions {
  port: number;
  region: string;
  authorizer: (event: APIGatewayRequestAuthorizerEvent) => Promise<APIGatewayAuthorizerResult>;
  handler: (event: WebSocketEvent) => Promise<APIGatewayProxyResultV2>;
}

/** Route keys the API would define; anything else goes to $default. */
const ACTION_ROUTES = new Set(['subscribe', 'unsubscribe', 'ping']);
const MAX_MESSAGE_BYTES = 128 * 1024;

export async function startWebSocketGateway(options: WebSocketGatewayOptions): Promise<Server> {
  const sockets = new Map<string, { socket: WebSocket; connectedAt: string; sourceIp: string }>();
  const wss = new WebSocketServer({ noServer: true });

  const event = (
    connectionId: string,
    routeKey: string,
    extra: { body?: string; authorizer?: Record<string, unknown> } = {},
  ): WebSocketEvent =>
    ({
      requestContext: {
        routeKey,
        eventType:
          routeKey === '$connect'
            ? 'CONNECT'
            : routeKey === '$disconnect'
              ? 'DISCONNECT'
              : 'MESSAGE',
        connectionId,
        domainName: `localhost:${options.port}`,
        stage: 'local',
        apiId: 'local',
        requestId: randomBytes(8).toString('hex'),
        requestTimeEpoch: Date.now(),
        connectedAt: Date.now(),
        messageId: randomBytes(8).toString('hex'),
        extendedRequestId: '',
        messageDirection: 'IN',
        requestTime: new Date().toISOString(),
        authorizer: extra.authorizer ?? null,
      },
      body: extra.body,
      isBase64Encoded: false,
    }) as unknown as WebSocketEvent;

  const server = createServer((req, res) => {
    void (async () => {
      const match = /^\/@connections\/([^/?]+)/.exec(req.url ?? '');
      if (!match) return send(res, 404, { message: 'Not found' });
      const connectionId = decodeURIComponent(match[1]!);
      const entry = sockets.get(connectionId);
      if (!entry) {
        res.writeHead(410, {
          'Content-Type': 'application/json',
          'x-amzn-ErrorType': 'GoneException',
        });
        res.end(JSON.stringify({ message: `Connection ${connectionId} is gone` }));
        return;
      }
      if (req.method === 'POST') {
        const data = await readBody(req);
        if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES) {
          log.warn(
            `message to ${connectionId} is ${Buffer.byteLength(data)} bytes; API Gateway would reject it`,
          );
        }
        entry.socket.send(data);
        res.writeHead(200).end();
      } else if (req.method === 'DELETE') {
        entry.socket.close(1000, 'Closed by server');
        res.writeHead(204).end();
      } else {
        send(res, 200, {
          ConnectedAt: entry.connectedAt,
          LastActiveAt: entry.connectedAt,
          Identity: { SourceIp: entry.sourceIp },
        });
      }
    })().catch((error: unknown) => {
      log.error('management API error', error);
      if (!res.headersSent) send(res, 500, { message: 'Internal error' });
    });
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const query = Object.fromEntries(url.searchParams.entries());
      let authorized: APIGatewayAuthorizerResult;
      try {
        authorized = await options.authorizer({
          type: 'REQUEST',
          methodArn: `arn:aws:execute-api:${options.region}:000000000000:local/local/$connect`,
          resource: '$connect',
          path: url.pathname,
          httpMethod: 'GET',
          headers: req.headers as Record<string, string>,
          multiValueHeaders: {},
          pathParameters: null,
          queryStringParameters: query,
          multiValueQueryStringParameters: null,
          stageVariables: null,
          requestContext: {} as APIGatewayRequestAuthorizerEvent['requestContext'],
        });
      } catch {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        return;
      }

      const connectionId = randomBytes(9).toString('base64').replace(/\//g, '_');
      const authorizer = { principalId: authorized.principalId, ...authorized.context };
      const connected = await options.handler(event(connectionId, '$connect', { authorizer }));
      const status = typeof connected === 'object' ? (connected.statusCode ?? 200) : 200;
      if (status !== 200) {
        socket.end(`HTTP/1.1 ${status} Forbidden\r\nConnection: close\r\n\r\n`);
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        sockets.set(connectionId, {
          socket: ws,
          connectedAt: new Date().toISOString(),
          sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
        });
        log.info(`ws ${connectionId} connected (${String(authorized.context?.email ?? '')})`);
        ws.on('message', (data) => {
          const body = data.toString();
          let action: unknown;
          try {
            action = (JSON.parse(body) as { action?: unknown }).action;
          } catch {
            action = undefined;
          }
          const routeKey =
            typeof action === 'string' && ACTION_ROUTES.has(action) ? action : '$default';
          options.handler(event(connectionId, routeKey, { body })).catch((error: unknown) => {
            log.error(`ws ${connectionId} message failed`, error);
          });
        });
        ws.on('close', () => {
          sockets.delete(connectionId);
          options.handler(event(connectionId, '$disconnect')).catch((error: unknown) => {
            log.error(`ws ${connectionId} disconnect failed`, error);
          });
          log.info(`ws ${connectionId} disconnected`);
        });
      });
    })().catch((error: unknown) => {
      log.error('ws upgrade failed', error);
      socket.destroy();
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port, resolve));
  return server;
}
