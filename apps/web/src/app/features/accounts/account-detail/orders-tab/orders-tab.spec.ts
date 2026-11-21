import { anAccountApi, setUpAccountPage, textsOf } from '../../../../../testing/account-page';
import { aPage, anOrder, anOrderSummary } from '../../../../../testing/fixtures';

const FAILED = anOrderSummary({
  id: 'ord_0002',
  status: 'failed',
  title: 'Add 3 users at Ottawa HQ',
  counts: { total: 3, pending: 0, provisioning: 0, succeeded: 2, failed: 1 },
  createdAt: '2026-11-21T13:00:00.000Z',
  updatedAt: '2026-11-21T13:01:00.000Z',
});
const RUNNING = anOrderSummary({ createdAt: '2026-11-21T14:00:00.000Z' });

describe('OrdersTab', () => {
  it('lists the account orders, each linking to its detail page', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/orders', aPage([RUNNING, FAILED]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/orders');

    expect(textsOf(page.host(), 'td.mat-column-title')).toEqual([
      'Add 2 users at Kanata Campus',
      'Add 3 users at Ottawa HQ',
    ]);
    expect(textsOf(page.host(), 'td.mat-column-status')).toEqual(['Provisioning', 'Failed']);
    expect(textsOf(page.host(), 'td.mat-column-progress')).toEqual(['0/2', '3/3, 1 failed']);
    expect(page.host().querySelector('td.mat-column-title a')?.getAttribute('href')).toBe(
      '/accounts/acc_northwind/orders/ord_0001',
    );
  });

  it('filters by status through the API', async () => {
    const api = anAccountApi();
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/orders?status=failed');
    expect(api.requestsTo('/accounts/acc_northwind/orders').at(-1)?.params.get('status')).toBe(
      'failed',
    );
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe(
      'No orders with this status',
    );
  });

  it('follows orders live: status changes in place, new orders on top', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/orders', aPage([RUNNING, FAILED]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/orders');

    page.realtime.push(
      anOrder({
        status: 'active',
        counts: { total: 2, pending: 0, provisioning: 0, succeeded: 2, failed: 0 },
        updatedAt: '2026-11-21T14:02:00.000Z',
      }),
    );
    page.realtime.push(
      anOrder({
        id: 'ord_0003',
        title: 'Remove Ada Lovelace',
        status: 'submitted',
        createdAt: '2026-11-21T14:10:00.000Z',
        updatedAt: '2026-11-21T14:10:00.000Z',
      }),
    );
    page.realtime.push(anOrder({ id: 'ord_other', accountId: 'acc_other', title: 'Elsewhere' }));
    await page.settle();

    expect(textsOf(page.host(), 'td.mat-column-title')).toEqual([
      'Remove Ada Lovelace',
      'Add 2 users at Kanata Campus',
      'Add 3 users at Ottawa HQ',
    ]);
    expect(textsOf(page.host(), 'td.mat-column-status')).toEqual(['Submitted', 'Active', 'Failed']);
  });

  it('suggests a first order when there are none', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/orders');
    const action = page.host().querySelector<HTMLAnchorElement>('app-empty-state a')!;
    expect(action.textContent?.trim()).toBe('New order');
    expect(action.getAttribute('href')).toBe('/accounts/acc_northwind/orders/new');
  });
});
