import { describe, expect, it } from 'vitest';
import { Router, type RouteHandler } from './router';

const ok: RouteHandler = async () => ({ status: 200, body: null });

describe('Router', () => {
  const router = new Router()
    .get('/accounts/{accountId}/orders/{orderId}', ok)
    .post('/accounts/{accountId}/orders/preview', ok)
    .post('/accounts/{accountId}/orders', ok)
    .get('/accounts/{accountId}/orders', ok);

  it('extracts and decodes path parameters', () => {
    const match = router.match('GET', '/accounts/acc%201/orders/ord_1');
    expect(match).toMatchObject({
      kind: 'matched',
      params: { accountId: 'acc 1', orderId: 'ord_1' },
    });
  });

  it('prefers literal segments over placeholders regardless of registration order', () => {
    const match = router.match('POST', '/accounts/a/orders/preview');
    expect(match).toMatchObject({
      kind: 'matched',
      pattern: '/accounts/{accountId}/orders/preview',
    });
  });

  it('reports the allowed methods when only the method is wrong', () => {
    expect(router.match('DELETE', '/accounts/a/orders')).toEqual({
      kind: 'method_not_allowed',
      allowed: expect.arrayContaining(['GET', 'POST']),
    });
  });

  it('ignores trailing slashes and rejects unknown paths', () => {
    expect(router.match('GET', '/accounts/a/orders/')).toMatchObject({ kind: 'matched' });
    expect(router.match('GET', '/nope')).toEqual({ kind: 'not_found' });
  });

  it('treats malformed percent-encoding as no match', () => {
    expect(router.match('GET', '/accounts/%E0%A4%A/orders/x')).toEqual({ kind: 'not_found' });
  });
});
