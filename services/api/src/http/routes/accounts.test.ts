import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { account } from '../../test-support/fixtures';
import { createApi } from '../api';
import type { ApiDeps } from '../deps';

function api() {
  const list = vi.fn(async () => ({ items: [], nextCursor: null }));
  const deps = {
    accounts: { get: vi.fn(async (id: string) => (id === 'acc_test' ? account() : null)) },
    users: { list },
    now: () => new Date(),
  } as unknown as ApiDeps;
  return { app: createApi(deps, ['*']), list };
}

const get = (path: string, query: Record<string, string> | null): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path,
    headers: {},
    queryStringParameters: query,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      requestId: 'r',
      authorizer: { claims: { sub: 's', email: 'admin@example.com' } },
    },
  }) as unknown as APIGatewayProxyEvent;

describe('GET /accounts/{id}/users', () => {
  it('passes q, siteId, cursor and limit to the repository', async () => {
    const { app, list } = api();
    const result = await app(
      get('/accounts/acc_test/users', { q: '613 555', siteId: 'site_k', cursor: 'c', limit: '10' }),
    );
    expect(result.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith('acc_test', {
      q: '613 555',
      siteId: 'site_k',
      cursor: 'c',
      limit: 10,
    });
  });

  it('treats an empty q as not set', async () => {
    const { app, list } = api();
    await app(get('/accounts/acc_test/users', { q: '' }));
    expect(list).toHaveBeenCalledWith('acc_test', {});
  });

  it('rejects an over-long q and a bad limit', async () => {
    const { app, list } = api();
    const long = await app(get('/accounts/acc_test/users', { q: 'x'.repeat(101) }));
    expect(long.statusCode).toBe(400);
    const bad = await app(get('/accounts/acc_test/users', { limit: '0' }));
    expect(bad.statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});
