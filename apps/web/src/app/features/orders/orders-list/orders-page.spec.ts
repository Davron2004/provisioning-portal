import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideAppIcons } from '../../../core/icons/icons';
import { textsOf } from '../../../../testing/account-page';
import { FakeApi, provideFakeApi } from '../../../../testing/fake-api';
import { aPage, anOrder, anOrderSummary } from '../../../../testing/fixtures';
import { FakeRealtime, provideFakeRealtime } from '../../../../testing/realtime-fake';
import { provideTestConfig } from '../../../../testing/test-config';
import { OrdersPage } from './orders-page';

const at = (minute: number) => `2026-11-21T14:${String(minute).padStart(2, '0')}:00.000Z`;

describe('OrdersPage', () => {
  let api: FakeApi;
  let realtime: FakeRealtime;

  const setUp = async (url: string) => {
    api = new FakeApi().on('/orders', (request) => {
      const status = request.params.get('status');
      const all = [
        anOrderSummary({
          id: 'ord_b',
          title: 'Add 20 users',
          createdAt: at(20),
          updatedAt: at(20),
        }),
        anOrderSummary({
          id: 'ord_a',
          title: 'Remove 1 user',
          status: 'failed',
          accountName: 'Carling Pine Logistics',
          createdAt: at(10),
          updatedAt: at(12),
          counts: { total: 1, pending: 0, provisioning: 0, succeeded: 0, failed: 1 },
        }),
      ];
      return aPage(all.filter((o) => !status || o.status === status));
    });
    realtime = new FakeRealtime();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'orders', component: OrdersPage }], withComponentInputBinding()),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
        provideFakeRealtime(realtime),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    const host = harness.fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    return { host, settle };
  };

  const titles = (host: HTMLElement) => textsOf(host, 'td.mat-column-title');

  it('lists every account’s orders with their progress, following live updates', async () => {
    const { host, settle } = await setUp('/orders');
    expect(titles(host)).toEqual(['Add 20 users', 'Remove 1 user']);
    expect(textsOf(host, 'td.mat-column-progress')).toEqual(['0/2', '1/1, 1 failed']);
    expect(realtime.subscribed).toEqual(['*']);

    // An update to a listed order replaces it in place; a new order goes on top.
    realtime.push(
      anOrder({
        id: 'ord_b',
        title: 'Add 20 users',
        status: 'active',
        createdAt: at(20),
        updatedAt: at(30),
      }),
    );
    realtime.push(
      anOrder({ id: 'ord_c', title: 'Brand new', createdAt: at(31), updatedAt: at(31) }),
    );
    await settle();

    expect(titles(host)).toEqual(['Brand new', 'Add 20 users', 'Remove 1 user']);
    expect(textsOf(host, 'td.mat-column-status')[1]).toBe('Active');
  });

  it('filters by status through the URL', async () => {
    const { host, settle } = await setUp('/orders?status=failed');
    expect(titles(host)).toEqual(['Remove 1 user']);
    expect(api.requestsTo('/orders').at(-1)?.params.get('status')).toBe('failed');
    expect(host.querySelector('mat-chip-option.mat-mdc-chip-selected')?.textContent).toContain(
      'Failed',
    );

    host.querySelectorAll<HTMLElement>('mat-chip-option .mdc-evolution-chip__action')[0]!.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/orders');
    expect(titles(host)).toEqual(['Add 20 users', 'Remove 1 user']);
  });

  it('offers a way back when a filter matches nothing', async () => {
    const { host } = await setUp('/orders?status=validating');
    expect(host.querySelector('app-empty-state')?.textContent).toContain(
      'No orders with this status',
    );
  });

  it('reads the list again after the live connection comes back', async () => {
    const { settle } = await setUp('/orders');
    realtime.state.set('reconnecting');
    await settle();
    realtime.state.set('live');
    await settle();
    expect(api.requestsTo('/orders')).toHaveLength(2);
  });
});
