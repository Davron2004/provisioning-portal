import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  LocalLoginRequest,
  type LocalLoginResponse,
  type RuntimeConfig,
} from '@provisioning/contracts';
import { issueLocalToken, type TokenVerifier } from '../auth/tokens';
import { corsHeaders } from '../http/app';
import { findDemoUser } from './demo-users';

/**
 * Stands in for API Gateway (REST API, proxy integration, Cognito authorizer)
 * in front of the real `http.ts` handler:
 *  - verifies the bearer token like the Cognito authorizer and puts the
 *    claims at `requestContext.authorizer.claims`;
 *  - builds an APIGatewayProxyEvent and writes the handler's result back.
 * It also serves the two things that are not Lambda routes in AWS:
 * `/config.json` (written next to the web app by CDK) and `/auth/login`
 * (Cognito's job in AWS).
 */
export interface RestGatewayOptions {
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  verifier: TokenVerifier;
  runtimeConfig: RuntimeConfig;
  allowedOrigins: string[];
}

export function createRestGateway(options: RestGatewayOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = (req.method ?? 'GET').toUpperCase();
    const headers = flattenHeaders(req);
    const cors = corsHeaders(headers, options.allowedOrigins);
    const body = await readBody(req);

    if (url.pathname === '/config.json' && method === 'GET') {
      return send(res, 200, options.runtimeConfig, cors);
    }
    if (url.pathname === '/auth/login') {
      if (method === 'OPTIONS') return send(res, 204, undefined, cors);
      if (method === 'POST') return login(res, body, cors);
    }

    // OPTIONS preflights reach the handler without a token, like a CORS mock integration.
    let claims: Record<string, unknown> | undefined;
    if (method !== 'OPTIONS') {
      const token = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      try {
        if (!token) throw new Error('missing token');
        claims = (await options.verifier.verify(token)).claims;
      } catch {
        // Mirrors the UNAUTHORIZED gateway response CDK configures in AWS.
        return send(res, 401, { error: { code: 'unauthorized', message: 'Unauthorized' } }, cors);
      }
    }

    const event = toProxyEvent(req, url, method, headers, body, claims);
    const result = await options.handler(event);
    res.writeHead(result.statusCode, result.headers as Record<string, string>);
    res.end(result.body);
  };
}

async function login(res: ServerResponse, body: string, cors: Record<string, string>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    parsed = undefined;
  }
  const request = LocalLoginRequest.safeParse(parsed);
  if (!request.success) {
    return send(
      res,
      400,
      { error: { code: 'bad_request', message: 'Email and password are required' } },
      cors,
    );
  }
  const user = findDemoUser(request.data.email, request.data.password);
  if (!user) {
    return send(
      res,
      401,
      { error: { code: 'unauthorized', message: 'Wrong email or password' } },
      cors,
    );
  }
  const token = await issueLocalToken(user);
  const response: LocalLoginResponse = { ...token, user: { email: user.email, name: user.name } };
  return send(res, 200, response, cors);
}

function toProxyEvent(
  req: IncomingMessage,
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string,
  claims: Record<string, unknown> | undefined,
): APIGatewayProxyEvent {
  const query = Object.fromEntries(url.searchParams.entries());
  const multiQuery: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams.entries()) (multiQuery[k] ??= []).push(v);
  const requestId = randomUUID();
  return {
    resource: '/{proxy+}',
    path: url.pathname,
    httpMethod: method,
    headers,
    multiValueHeaders: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, [v]])),
    queryStringParameters: Object.keys(query).length > 0 ? query : null,
    multiValueQueryStringParameters: Object.keys(multiQuery).length > 0 ? multiQuery : null,
    pathParameters: { proxy: url.pathname.replace(/^\//, '') },
    stageVariables: null,
    body: body === '' ? null : body,
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'local',
      authorizer: claims ? { claims } : null,
      protocol: `HTTP/${req.httpVersion}`,
      httpMethod: method,
      identity: {
        sourceIp: req.socket.remoteAddress ?? '127.0.0.1',
        userAgent: headers['user-agent'] ?? null,
      },
      path: url.pathname,
      stage: 'local',
      requestId,
      requestTimeEpoch: Date.now(),
      resourceId: 'local',
      resourcePath: '/{proxy+}',
    } as APIGatewayProxyEvent['requestContext'],
  };
}

function flattenHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined)
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }
  return headers;
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
