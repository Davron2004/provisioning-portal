import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedLine, UserSnapshot } from '@provisioning/contracts';
import { createOrder } from '../../domain/order-lifecycle';
import { ConflictError } from '../../errors';
import { account } from '../../test-support/fixtures';
import { createApi } from '../api';
import type { ApiDeps } from '../deps';

const before: UserSnapshot = {
  firstName: 'Sofia',
  lastName: 'Beaulieu',
  email: 's@test.example.com',
  siteId: 'site_k',
  extension: '2100',
  did: null,
  voicemail: true,
  deviceModel: null,
  macAddress: null,
};
const lines: ResolvedLine[] = [{ action: 'remove_user', userId: 'u1', before }];
const createRequest = {
  lines,
  source: 'manual',
  prompt: null,
  idempotencyKey: '3b241101-e2bb-4255-8caf-4136c566a962',
};
const order = {
  ...createOrder({
    id: 'ord_1',
    accountId: 'acc_test',
    accountName: 'Test Co',
    lines,
    siteNames: new Map(),
    source: 'manual',
    prompt: null,
    submittedBy: 'admin@example.com',
    now: new Date('2026-11-21T15:00:00.000Z'),
  }),
  version: 1,
};

function api() {
  const orderService = {
    preview: vi.fn(async () => ({
      accountId: 'acc_test',
      lines: [],
      issues: [],
      summary: { adds: 0, updates: 0, removes: 0 },
      valid: true,
    })),
    create: vi.fn(async () => order),
    retry: vi.fn(async () => {
      throw new ConflictError('Order is active; only failed orders can be retried');
    }),
  };
  const deps = {
    accounts: { get: vi.fn(async (id: string) => (id === 'acc_test' ? account() : null)) },
    orderService,
    now: () => new Date(),
  } as unknown as ApiDeps;
  return { app: createApi(deps, ['*']), orderService };
}

const post = (path: string, body: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path,
    headers: {},
    queryStringParameters: null,
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      requestId: 'r',
      authorizer: { claims: { sub: 's', email: 'admin@example.com' } },
    },
  }) as unknown as APIGatewayProxyEvent;

describe('order routes', () => {
  it('previews a schema-valid draft', async () => {
    const { app, orderService } = api();
    const draft = { lines: [{ action: 'remove_user', userId: 'u1' }] };
    const result = await app(post('/accounts/acc_test/orders/preview', draft));
    expect(result.statusCode).toBe(200);
    expect(orderService.preview).toHaveBeenCalledWith('acc_test', draft);
  });

  it('rejects a draft that fails the contract schema with field paths', async () => {
    const { app } = api();
    const result = await app(
      post('/accounts/acc_test/orders/preview', { lines: [{ action: 'add_user', email: 'nope' }] }),
    );
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details.issues.map((i: { path: string }) => i.path)).toContain(
      'lines.0.email',
    );
  });

  it('accepts an order with 202 and never leaks the internal version', async () => {
    const { app, orderService } = api();
    const result = await app(post('/accounts/acc_test/orders', createRequest));
    expect(result.statusCode).toBe(202);
    expect(JSON.parse(result.body)).not.toHaveProperty('version');
    expect(orderService.create).toHaveBeenCalledWith('acc_test', expect.anything(), {
      id: 's',
      email: 'admin@example.com',
      name: 'admin@example.com',
    });
  });

  it('returns 404 for an unknown account and 409 for retrying a finished order', async () => {
    const { app } = api();
    const missing = await app(post('/accounts/acc_missing/orders', createRequest));
    expect(missing.statusCode).toBe(404);
    const retry = await app(post('/accounts/acc_test/orders/ord_1/retry', undefined));
    expect(retry.statusCode).toBe(409);
  });
});
