import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@provisioning/contracts';
import { ConflictError } from '../errors';
import { createHttpApp } from './app';
import { Router } from './router';

const claims = { sub: 'u-1', email: 'admin@example.com', name: 'Avery Clarke' };

function event(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/things/1',
    headers: { Origin: 'http://localhost:4200' },
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: { requestId: 'req-1', authorizer: { claims } },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

describe('createHttpApp', () => {
  const router = new Router()
    .get('/things/{id}', async ({ params, actor, query }) => ({
      status: 200,
      body: { id: params.id, actor: actor.email, q: query.q ?? null },
    }))
    .post('/things', async ({ body }) => ({ status: 201, body }))
    .post('/conflict', async () => {
      throw new ConflictError('Already running', { orderId: 'o1' });
    })
    .get('/boom', async () => {
      throw new Error('secret internals');
    });
  const app = createHttpApp(router, { allowedOrigins: ['http://localhost:4200'] });

  it('routes, passes the caller and returns JSON with CORS headers', async () => {
    const result = await app(event({ queryStringParameters: { q: 'x' } }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ id: '1', actor: 'admin@example.com', q: 'x' });
    expect(result.headers).toMatchObject({
      'Access-Control-Allow-Origin': 'http://localhost:4200',
      'Content-Type': 'application/json',
    });
  });

  it('does not echo origins that are not allowed', async () => {
    const result = await app(event({ headers: { origin: 'https://evil.example.net' } }));
    expect(result.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('answers preflights without requiring a caller', async () => {
    const result = await app(event({ httpMethod: 'OPTIONS', requestContext: {} as never }));
    expect(result.statusCode).toBe(204);
    expect(result.headers?.['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('rejects requests without authorizer claims', async () => {
    const result = await app(event({ requestContext: { requestId: 'r' } as never }));
    expect(result.statusCode).toBe(401);
    expect(ApiError.parse(JSON.parse(result.body)).error.code).toBe('unauthorized');
  });

  it('maps unknown routes, wrong methods and bad JSON to ApiErrors', async () => {
    const notFound = await app(event({ path: '/missing' }));
    expect(notFound.statusCode).toBe(404);
    const wrongMethod = await app(event({ httpMethod: 'DELETE' }));
    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongMethod.headers?.Allow).toBe('GET');
    const badJson = await app(event({ httpMethod: 'POST', path: '/things', body: '{' }));
    expect(badJson.statusCode).toBe(400);
    expect(JSON.parse(badJson.body).error.code).toBe('bad_request');
  });

  it('decodes base64 bodies', async () => {
    const body = Buffer.from(JSON.stringify({ a: 1 })).toString('base64');
    const result = await app(
      event({ httpMethod: 'POST', path: '/things', body, isBase64Encoded: true }),
    );
    expect(JSON.parse(result.body)).toEqual({ a: 1 });
  });

  it('maps AppErrors with details and hides unexpected errors', async () => {
    const conflict = await app(event({ httpMethod: 'POST', path: '/conflict' }));
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body)).toEqual({
      error: { code: 'conflict', message: 'Already running', details: { orderId: 'o1' } },
    });

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = await app(event({ path: '/boom' }));
    spy.mockRestore();
    expect(boom.statusCode).toBe(500);
    expect(boom.body).not.toContain('secret internals');
    expect(JSON.parse(boom.body).error).toMatchObject({
      code: 'internal',
      details: { requestId: 'req-1' },
    });
  });
});
