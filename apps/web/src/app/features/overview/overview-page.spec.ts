import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { anOrder, anOrderSummary, anOverview } from '../../../testing/fixtures';
import { FakeRealtime, provideFakeRealtime } from '../../../testing/realtime-fake';
import { provideTestConfig } from '../../../testing/test-config';
import { provideAppIcons } from '../../core/icons/icons';
import { OVERVIEW_RELOAD_DEBOUNCE_MS, OverviewPage } from './overview-page';

describe('OverviewPage', () => {
  let api: FakeApi;
  let realtime: FakeRealtime;

  const render = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
        provideFakeRealtime(realtime),
      ],
    });
    const fixture = TestBed.createComponent(OverviewPage);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };

  const text = (host: HTMLElement, selector: string) =>
    [...host.querySelectorAll(selector)].map((el) => el.textContent?.replace(/\s+/g, ' ').trim());

  beforeEach(() => {
    api = new FakeApi();
    realtime = new FakeRealtime();
  });

  afterEach(() => vi.useRealTimers());

  it('shows the totals, number utilization and order counts', async () => {
    api.on('/overview', anOverview());
    const { host } = await render();

    expect(text(host, '.tile-value')).toEqual(['5', '13', '192', '189']);
    const meter = host.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('189');
    expect(meter.getAttribute('aria-valuemax')).toBe('410');
    expect(host.querySelector('app-order-status-breakdown')?.textContent).toContain(
      '13 orders, 1 in progress',
    );
  });

  it('links each recent order to its detail page', async () => {
    api.on('/overview', anOverview({ recentOrders: [anOrderSummary({ status: 'failed' })] }));
    const { host } = await render();

    const link = host.querySelector<HTMLAnchorElement>('.order a')!;
    expect(link.textContent?.trim()).toBe('Add 2 users at Kanata Campus');
    expect(link.getAttribute('href')).toBe('/accounts/acc_northwind/orders/ord_0001');
    expect(host.querySelector('.order app-status-chip')?.textContent?.trim()).toBe('Failed');
  });

  it('shows when each recent order was submitted, the order they are listed in', async () => {
    api.on(
      '/overview',
      anOverview({
        recentOrders: [
          anOrderSummary({
            createdAt: '2026-11-21T14:00:00.000Z',
            updatedAt: '2026-11-21T14:30:00.000Z',
          }),
        ],
      }),
    );
    const { host } = await render();
    expect(host.querySelector('.order time')?.getAttribute('datetime')).toBe(
      '2026-11-21T14:00:00.000Z',
    );
  });

  it('says so when there are no orders yet', async () => {
    api.on('/overview', anOverview({ recentOrders: [] }));
    const { host } = await render();
    expect(host.querySelector('app-empty-state')?.textContent).toContain('No orders yet');
  });

  it('holds the layout with placeholders while loading', async () => {
    api.hold('/overview');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
        provideFakeRealtime(realtime),
      ],
    });
    const fixture = TestBed.createComponent(OverviewPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.kpis')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('.tile app-skeleton').length).toBeGreaterThan(0);
    expect(host.querySelector('app-error-state')).toBeNull();
  });

  it('shows an error with a retry that loads the page', async () => {
    api.fail('/overview', 500, 'The database is taking a nap.');
    const { fixture, host } = await render();
    expect(host.querySelector('app-error-state')?.textContent).toContain(
      'The database is taking a nap.',
    );

    api.on('/overview', anOverview());
    host.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await fixture.whenStable();

    expect(host.querySelector('app-error-state')).toBeNull();
    expect(text(host, '.tile-value')[0]).toBe('5');
  });

  it('applies pushed orders at once and reloads the counts once updates settle', async () => {
    api.on('/overview', anOverview({ generatedAt: '2026-11-21T14:05:00.000Z' }));
    const { fixture, host } = await render();
    expect(realtime.subscribed).toEqual(['*']);
    // debounceTime runs on setInterval and checks Date.now().
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });

    realtime.push(
      anOrder({
        id: 'ord_0002',
        title: 'Add 5 users at Ottawa HQ',
        status: 'submitted',
        createdAt: '2026-11-21T14:06:00.000Z',
        updatedAt: '2026-11-21T14:06:00.000Z',
      }),
    );
    fixture.detectChanges();

    expect(text(host, '.order-title')[0]).toBe('Add 5 users at Ottawa HQ');
    expect(host.querySelector('app-order-status-breakdown')?.textContent).toContain(
      '14 orders, 2 in progress',
    );
    expect(api.requestsTo('/overview')).toHaveLength(1);

    vi.advanceTimersByTime(OVERVIEW_RELOAD_DEBOUNCE_MS);
    TestBed.tick();
    expect(api.requestsTo('/overview')).toHaveLength(2);
  });
});
