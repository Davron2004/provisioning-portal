import { anOrder, anOrderSummary, anOverview } from '../../../testing/fixtures';
import {
  RECENT_ORDER_LIMIT,
  applyOrderToOverview,
  mergeLiveOrders,
  toOrderSummary,
} from './live-orders';

const at = (minute: number) => `2026-11-21T14:${String(minute).padStart(2, '0')}:00.000Z`;

describe('mergeLiveOrders', () => {
  const listed = [
    anOrderSummary({ id: 'ord_b', createdAt: at(20), updatedAt: at(20), status: 'provisioning' }),
    anOrderSummary({ id: 'ord_a', createdAt: at(10), updatedAt: at(10), status: 'active' }),
  ];

  it('replaces a listed order with a newer update, in place', () => {
    const update = { ...listed[0]!, status: 'active' as const, updatedAt: at(25) };
    const merged = mergeLiveOrders(listed, [update]);
    expect(merged.map((o) => [o.id, o.status])).toEqual([
      ['ord_b', 'active'],
      ['ord_a', 'active'],
    ]);
  });

  it('keeps the listed order when the push is older (a reload already has fresher data)', () => {
    const stale = { ...listed[0]!, status: 'validating' as const, updatedAt: at(15) };
    expect(mergeLiveOrders(listed, [stale])[0]?.status).toBe('provisioning');
  });

  it('adds new orders on top, but not older ones that belong to a later page', () => {
    const fresh = anOrderSummary({ id: 'ord_c', createdAt: at(30), updatedAt: at(30) });
    const old = anOrderSummary({ id: 'ord_0', createdAt: at(1), updatedAt: at(40) });
    expect(mergeLiveOrders(listed, [old, fresh]).map((o) => o.id)).toEqual([
      'ord_c',
      'ord_b',
      'ord_a',
    ]);
  });

  it('respects the list filter for added orders', () => {
    const fresh = anOrderSummary({ id: 'ord_c', createdAt: at(30), status: 'failed' });
    const onlyActive = (o: { status: string }) => o.status === 'active';
    expect(mergeLiveOrders(listed, [fresh], onlyActive).map((o) => o.id)).toEqual([
      'ord_b',
      'ord_a',
    ]);
  });

  it('returns the same array when nothing was pushed', () => {
    expect(mergeLiveOrders(listed, [])).toBe(listed);
  });
});

describe('applyOrderToOverview', () => {
  const overview = anOverview({
    ordersByStatus: { submitted: 0, validating: 0, provisioning: 1, active: 10, failed: 2 },
    recentOrders: [anOrderSummary({ id: 'ord_1', status: 'provisioning', updatedAt: at(1) })],
    generatedAt: at(5),
  });

  it('moves a known order between status counts', () => {
    const next = applyOrderToOverview(
      overview,
      anOrder({ id: 'ord_1', status: 'active', updatedAt: at(6) }),
    );
    expect(next.ordersByStatus).toMatchObject({ provisioning: 0, active: 11 });
    expect(next.recentOrders[0]).toMatchObject({ id: 'ord_1', status: 'active' });
    expect(next.recentOrders[0]).not.toHaveProperty('lines');
  });

  it('counts an order created after the overview was generated', () => {
    const next = applyOrderToOverview(
      overview,
      anOrder({ id: 'ord_2', status: 'submitted', createdAt: at(7), updatedAt: at(7) }),
    );
    expect(next.ordersByStatus.submitted).toBe(1);
    expect(next.recentOrders.map((o) => o.id)).toEqual(['ord_2', 'ord_1']);
  });

  it('leaves counts alone for an older order it cannot place', () => {
    const next = applyOrderToOverview(
      overview,
      anOrder({ id: 'ord_old', status: 'failed', createdAt: at(0), updatedAt: at(8) }),
    );
    expect(next.ordersByStatus).toEqual(overview.ordersByStatus);
  });

  it('ignores a push older than what it shows', () => {
    const stale = anOrder({ id: 'ord_1', status: 'validating', updatedAt: at(0) });
    expect(applyOrderToOverview(overview, stale)).toBe(overview);
  });

  it(`keeps the newest ${RECENT_ORDER_LIMIT} orders`, () => {
    const full = anOverview({
      generatedAt: at(30),
      recentOrders: Array.from({ length: RECENT_ORDER_LIMIT }, (_, i) =>
        anOrderSummary({ id: `ord_${i}`, createdAt: at(20 - i), updatedAt: at(20 - i) }),
      ),
    });
    const next = applyOrderToOverview(
      full,
      anOrder({ id: 'ord_new', createdAt: at(31), updatedAt: at(31) }),
    );
    expect(next.recentOrders).toHaveLength(RECENT_ORDER_LIMIT);
    expect(next.recentOrders[0]?.id).toBe('ord_new');
  });
});

describe('toOrderSummary', () => {
  it('drops lines, events and prompt', () => {
    expect(Object.keys(toOrderSummary(anOrder())).sort()).toEqual(
      Object.keys(anOrderSummary()).sort(),
    );
  });
});
