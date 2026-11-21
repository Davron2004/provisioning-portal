import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Order, OrderLine } from '@provisioning/contracts';
import { of } from 'rxjs';
import { provideAppIcons } from '../../../core/icons/icons';
import { NotificationService } from '../../../core/notifications/notification';
import { textsOf } from '../../../../testing/account-page';
import { FakeApi, provideFakeApi } from '../../../../testing/fake-api';
import { anOrder } from '../../../../testing/fixtures';
import { FakeRealtime, provideFakeRealtime } from '../../../../testing/realtime-fake';
import { provideTestConfig } from '../../../../testing/test-config';
import { latestOrder, latestRunStart, optimisticRetry } from './live-order';
import { OrderDetailPage } from './order-detail-page';

const ORDER_PATH = '/accounts/acc_northwind/orders/ord_0001';

function aLine(n: number, overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    action: 'add_user',
    user: {
      firstName: 'User',
      lastName: `${n}`,
      email: `user.${n}@northwind.example.com`,
      siteId: 'site_kanata',
      extension: `21${n}0`,
      did: null,
      voicemail: true,
      deviceModel: null,
      macAddress: null,
    },
    lineId: `line-${n}`,
    status: 'pending',
    attempts: 0,
    step: null,
    error: null,
    userId: null,
    updatedAt: '2026-11-21T14:00:00.000Z',
    ...overrides,
  } as OrderLine;
}

const failedOrder = (): Order =>
  anOrder({
    status: 'failed',
    updatedAt: '2026-11-21T14:02:00.000Z',
    completedAt: '2026-11-21T14:02:00.000Z',
    counts: { total: 2, pending: 0, provisioning: 0, succeeded: 1, failed: 1 },
    lines: [
      aLine(1, { status: 'succeeded', attempts: 1 }),
      aLine(2, { status: 'failed', attempts: 3, error: 'Carrier rejected the number' }),
    ],
  });

describe('latestOrder', () => {
  const at = (updatedAt: string, id = 'ord_0001') => anOrder({ id, updatedAt });

  it('keeps whichever version is newer, whichever way they arrive', () => {
    const older = at('2026-11-21T14:01:00.000Z');
    const newer = at('2026-11-21T14:02:00.000Z');
    expect(latestOrder(older, newer)).toBe(newer);
    expect(latestOrder(newer, older)).toBe(newer);
    expect(latestOrder(newer, undefined)).toBe(newer);
    expect(latestOrder(undefined, older)).toBe(older);
  });

  it('switches to a different order outright', () => {
    const other = at('2020-01-01T00:00:00.000Z', 'ord_0002');
    expect(latestOrder(at('2026-11-21T14:02:00.000Z'), other)).toBe(other);
  });
});

describe('optimisticRetry', () => {
  it('puts failed lines back to pending and the order back to provisioning', () => {
    const retried = optimisticRetry(failedOrder());
    expect(retried.status).toBe('provisioning');
    expect(retried.completedAt).toBeNull();
    expect(retried.lines.map((line) => [line.status, line.error])).toEqual([
      ['succeeded', null],
      ['pending', null],
    ]);
    expect(retried.counts).toMatchObject({ pending: 1, failed: 0, succeeded: 1 });
  });
});

const event = (at: string, status: Order['status'] | null, message = '') => ({
  at: `2026-11-21T${at}:00.000Z`,
  status,
  lineId: null,
  message,
});

describe('latestRunStart', () => {
  it('is the submission until the order is retried, then the retry', () => {
    const firstRun = [
      event('14:00', 'submitted'),
      event('14:00', 'validating'),
      event('14:01', 'provisioning'),
      event('14:01', null, 'Line 2 failed'),
      event('14:02', 'failed'),
    ];
    const createdAt = '2026-11-21T14:00:00.000Z';
    expect(latestRunStart({ createdAt, events: firstRun })).toBe(createdAt);

    const retried = [
      ...firstRun,
      event('16:30', 'provisioning', 'Retry of 1 failed line requested'),
      event('16:31', 'active'),
    ];
    expect(latestRunStart({ createdAt, events: retried })).toBe('2026-11-21T16:30:00.000Z');
  });
});

describe('OrderDetailPage', () => {
  let api: FakeApi;
  let realtime: FakeRealtime;
  let notifications: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const setUp = async (
    order: Order,
    { handset = false, configure = (_: FakeApi) => undefined as unknown } = {},
  ) => {
    api = new FakeApi().on(ORDER_PATH, order);
    configure(api);
    realtime = new FakeRealtime();
    notifications = { info: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
        provideFakeRealtime(realtime),
        { provide: NotificationService, useValue: notifications },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: handset }), isMatched: () => handset },
        },
      ],
    });
    const fixture = TestBed.createComponent(OrderDetailPage);
    fixture.componentRef.setInput('accountId', 'acc_northwind');
    fixture.componentRef.setInput('orderId', 'ord_0001');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const settle = () => fixture.whenStable();
    return { fixture, host, settle };
  };

  const lineStatuses = (host: HTMLElement) =>
    textsOf(host, 'tbody tr app-status-chip').map((text) => text.toLowerCase());

  it('shows the order, its progress, lines and activity', async () => {
    const { host } = await setUp(
      anOrder({
        source: 'assistant',
        prompt: 'add 2 users at Kanata',
        counts: { total: 2, pending: 1, provisioning: 1, succeeded: 0, failed: 0 },
        lines: [aLine(1, { status: 'provisioning', step: 'Creating voicemail box' }), aLine(2)],
        events: [
          {
            at: '2026-11-21T14:00:00.000Z',
            status: 'submitted',
            lineId: null,
            message: 'Order submitted by admin@example.com',
          },
        ],
      }),
    );
    expect(host.querySelector('h1')?.textContent).toContain('Add 2 users at Kanata Campus');
    expect(host.querySelector('blockquote')?.textContent).toBe('add 2 users at Kanata');
    expect(textsOf(host, 'app-order-progress [aria-current="step"] .label')).toEqual([
      'Provisioning',
    ]);
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
    expect(textsOf(host, 'app-line-step')).toEqual(['Creating voicemail box', 'Waiting']);
    expect(textsOf(host, 'app-order-timeline li .message')).toEqual([
      'Order submitted by admin@example.com',
    ]);
    // Subscribed to the order's account for live updates.
    expect(realtime.subscribed).toEqual(['acc_northwind']);
    expect(host.querySelector('.live')?.textContent).toContain('Live');
  });

  it('merges pushes for this order, ignores other orders and stale versions', async () => {
    const { host, settle } = await setUp(
      anOrder({ lines: [aLine(1, { status: 'provisioning' })] }),
    );
    realtime.push(
      anOrder({
        status: 'active',
        updatedAt: '2026-11-21T14:03:00.000Z',
        counts: { total: 1, pending: 0, provisioning: 0, succeeded: 1, failed: 0 },
        lines: [aLine(1, { status: 'succeeded', attempts: 1 })],
      }),
    );
    realtime.push(
      anOrder({ id: 'ord_other', status: 'failed', updatedAt: '2026-11-21T15:00:00Z' }),
    );
    realtime.push(anOrder({ status: 'validating', updatedAt: '2026-11-21T14:00:30.000Z' }));
    await settle();

    expect(host.querySelector('app-page-header app-status-chip')?.textContent).toContain('Active');
    expect(lineStatuses(host)).toEqual(['succeeded']);
    // The status change is announced once, politely.
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Order active: all 1 line provisioned.',
    );
  });

  it('fetches the order again when the connection comes back', async () => {
    const { settle } = await setUp(anOrder());
    expect(api.requestsTo(ORDER_PATH)).toHaveLength(1);

    realtime.state.set('reconnecting');
    await settle();
    realtime.state.set('live');
    await settle();

    expect(api.requestsTo(ORDER_PATH)).toHaveLength(2);
  });

  it('retries failed lines optimistically, then follows live updates', async () => {
    const { fixture, host } = await setUp(failedOrder());
    api.hold(`${ORDER_PATH}/retry`);

    host.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    fixture.detectChanges();
    expect(api.requestsTo(`${ORDER_PATH}/retry`)[0]?.method).toBe('POST');
    expect(lineStatuses(host)).toEqual(['succeeded', 'pending']);
    expect(host.querySelector('app-page-header button')).toBeNull();

    realtime.push({
      ...failedOrder(),
      status: 'active',
      updatedAt: '2026-11-21T14:06:00.000Z',
      counts: { total: 2, pending: 0, provisioning: 0, succeeded: 2, failed: 0 },
      lines: [aLine(1, { status: 'succeeded' }), aLine(2, { status: 'succeeded', attempts: 4 })],
    });
    fixture.detectChanges();
    expect(lineStatuses(host)).toEqual(['succeeded', 'succeeded']);
  });

  it('takes the server’s answer to a retry', async () => {
    const { host, settle } = await setUp(failedOrder());
    api.on(`${ORDER_PATH}/retry`, {
      ...optimisticRetry(failedOrder()),
      updatedAt: '2026-11-21T14:05:00.000Z',
      lines: [aLine(1, { status: 'succeeded' }), aLine(2, { status: 'provisioning' })],
    });

    host.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    await settle();

    expect(lineStatuses(host)).toEqual(['succeeded', 'provisioning']);
    expect(notifications.info).toHaveBeenCalledWith('Retrying the failed lines.');
  });

  it('puts the order back and says why when a retry is refused', async () => {
    const { host, settle } = await setUp(failedOrder());
    api.on(`${ORDER_PATH}/retry`, () => {
      throw new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'conflict', message: 'Order is not failed' } },
      });
    });

    host.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    await settle();

    expect(lineStatuses(host)).toEqual(['succeeded', 'failed']);
    expect(notifications.error).toHaveBeenCalledWith(
      'This order is not failed any more, so there is nothing to retry.',
    );
    // And it re-reads the order, which may have moved on.
    expect(api.requestsTo(ORDER_PATH)).toHaveLength(2);
  });

  it('says how long the order took, and after a retry how long the retry took', async () => {
    const first = await setUp(
      anOrder({
        ...failedOrder(),
        events: [event('14:00', 'submitted'), event('14:02', 'failed')],
      }),
    );
    expect(first.host.querySelector('.facts')?.textContent).toContain('Took 2 min');
    TestBed.resetTestingModule();

    const retried = await setUp(
      anOrder({
        status: 'active',
        completedAt: '2026-11-23T12:26:20.000Z',
        events: [
          event('14:00', 'submitted'),
          event('14:02', 'failed'),
          { ...event('14:00', 'provisioning'), at: '2026-11-23T12:26:00.000Z' },
          { ...event('14:00', 'active'), at: '2026-11-23T12:26:20.000Z' },
        ],
      }),
    );
    const facts = retried.host.querySelector('.facts')?.textContent ?? '';
    expect(facts).toContain('Retry took 20 s');
    expect(facts).not.toContain('Took 2 days');
  });

  it('lists lines as cards on phones', async () => {
    const { host } = await setUp(failedOrder(), { handset: true });
    expect(host.querySelector('table')).toBeNull();
    expect(textsOf(host, '.app-card-list app-line-step')).toEqual([
      'Done',
      'Carrier rejected the number',
    ]);
  });

  it('shows an error state with a retry when the order cannot be loaded', async () => {
    const { host, settle } = await setUp(anOrder(), {
      configure: (fake) => fake.fail(ORDER_PATH, 404, 'Order not found'),
    });
    expect(host.querySelector('app-error-state')?.textContent).toContain('Order not found');

    api.on(ORDER_PATH, anOrder());
    host.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await settle();
    expect(host.querySelector('h1')?.textContent).toContain('Add 2 users at Kanata Campus');
  });
});
