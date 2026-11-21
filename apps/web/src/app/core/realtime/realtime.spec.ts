import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClientMessage, Order, ServerMessage } from '@provisioning/contracts';
import { anOrder } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { AuthService } from '../auth/auth';
import { REALTIME_OPTIONS, RealtimeService, WEB_SOCKET_FACTORY } from './realtime';

class FakeSocket {
  readyState = 0;
  readonly sent: ClientMessage[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
    this.closed = true;
  }

  // Test controls
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(message: ServerMessage | string): void {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1006 }));
  }
}

describe('RealtimeService', () => {
  let sockets: FakeSocket[];
  let token: ReturnType<typeof signal<string | null>>;
  let realtime: RealtimeService;

  const latest = () => sockets.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    // Jitter at its minimum: each delay is exactly half the backoff ceiling.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    sockets = [];
    token = signal<string | null>('token-1');
    TestBed.configureTestingModule({
      providers: [
        provideTestConfig(),
        { provide: AuthService, useValue: { token } },
        {
          provide: WEB_SOCKET_FACTORY,
          useValue: (url: string) => {
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket;
          },
        },
        {
          provide: REALTIME_OPTIONS,
          useValue: {
            heartbeatMs: 30_000,
            pongTimeoutMs: 10_000,
            initialBackoffMs: 1_000,
            maxBackoffMs: 8_000,
          },
        },
      ],
    });
    realtime = TestBed.inject(RealtimeService);
    TestBed.tick();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('connects with the session token once signed in', () => {
    expect(sockets).toHaveLength(1);
    expect(latest().url).toBe('ws://ws.test/?token=token-1');
    expect(realtime.state()).toBe('connecting');

    latest().open();
    expect(realtime.state()).toBe('live');
  });

  it('subscribes per account and delivers only matching order updates', () => {
    const forNorthwind: Order[] = [];
    const forAll: Order[] = [];
    realtime.orderUpdates('acc_northwind').subscribe((order) => forNorthwind.push(order));
    realtime.orderUpdates().subscribe((order) => forAll.push(order));
    latest().open();

    expect(latest().sent).toEqual([
      { action: 'subscribe', accountId: 'acc_northwind' },
      { action: 'subscribe', accountId: '*' },
    ]);

    latest().receive({ type: 'order.updated', order: anOrder({ accountId: 'acc_northwind' }) });
    latest().receive({ type: 'order.updated', order: anOrder({ accountId: 'acc_contoso' }) });

    expect(forNorthwind.map((o) => o.accountId)).toEqual(['acc_northwind']);
    expect(forAll.map((o) => o.accountId)).toEqual(['acc_northwind', 'acc_contoso']);
  });

  it('reference-counts subscriptions so the server hears one subscribe and one unsubscribe', () => {
    latest().open();
    const first = realtime.orderUpdates('acc_northwind').subscribe();
    const second = realtime.orderUpdates('acc_northwind').subscribe();
    first.unsubscribe();
    expect(latest().sent).toEqual([{ action: 'subscribe', accountId: 'acc_northwind' }]);

    second.unsubscribe();
    expect(latest().sent).toEqual([
      { action: 'subscribe', accountId: 'acc_northwind' },
      { action: 'unsubscribe', accountId: 'acc_northwind' },
    ]);
  });

  it('reconnects with exponential backoff and resubscribes', () => {
    realtime.orderUpdates('acc_northwind').subscribe();
    latest().open();

    latest().drop();
    expect(realtime.state()).toBe('reconnecting');
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    expect(realtime.state()).toBe('reconnecting');

    // The second attempt fails too: the next delay doubles.
    latest().drop();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    latest().open();
    expect(realtime.state()).toBe('live');
    expect(latest().sent).toEqual([{ action: 'subscribe', accountId: 'acc_northwind' }]);

    // A successful connection resets the backoff.
    latest().drop();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(4);
  });

  it('caps the backoff', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      latest().drop();
      vi.advanceTimersByTime(4_000);
    }
    expect(sockets).toHaveLength(7);
  });

  it('pings to keep the connection alive', () => {
    latest().open();
    vi.advanceTimersByTime(30_000);
    expect(latest().sent).toEqual([{ action: 'ping' }]);

    latest().receive({ type: 'pong' });
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(realtime.state()).toBe('live');
  });

  it('treats a missing pong as a dead connection', () => {
    latest().open();
    vi.advanceTimersByTime(30_000 + 10_000);

    expect(sockets[0]!.closed).toBe(true);
    expect(realtime.state()).toBe('reconnecting');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });

  it('ignores messages that do not match the contract', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const received: Order[] = [];
    realtime.orderUpdates().subscribe((order) => received.push(order));
    latest().open();

    latest().receive('not json');
    latest().receive(JSON.stringify({ type: 'order.updated', order: { id: 'x' } }));

    expect(received).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('disconnects on sign-out and does not reconnect', () => {
    latest().open();
    token.set(null);
    TestBed.tick();

    expect(sockets[0]!.closed).toBe(true);
    expect(realtime.state()).toBe('offline');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('reconnects with the new token when the session changes', () => {
    latest().open();
    token.set('token-2');
    TestBed.tick();

    expect(sockets[0]!.closed).toBe(true);
    expect(latest().url).toBe('ws://ws.test/?token=token-2');
  });
});
