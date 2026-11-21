import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  InjectionToken,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ALL_ACCOUNTS, ClientMessage, Order, ServerMessage } from '@provisioning/contracts';
import { Observable, Subject, Subscription, interval, timer } from 'rxjs';
import * as z from 'zod';
import { AuthService } from '../auth/auth';
import { AppConfig } from '../config/app-config';

/**
 * - `connecting`: first attempt after sign-in.
 * - `live`: connected; order updates arrive as they happen.
 * - `reconnecting`: the connection dropped; retrying with backoff.
 * - `offline`: signed out (no connection is wanted).
 */
export type ConnectionState = 'offline' | 'connecting' | 'live' | 'reconnecting';

/** The subset of WebSocket the service uses, so tests can pass a fake. */
export type RealtimeSocket = Pick<WebSocket, 'readyState' | 'send' | 'close'> & {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => RealtimeSocket>(
  'WEB_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => (url: string) => new WebSocket(url) },
);

export interface RealtimeOptions {
  /** How often to ping an idle connection. API Gateway drops idle sockets after 10 minutes. */
  readonly heartbeatMs: number;
  /** A ping without a pong for this long means the connection is dead. */
  readonly pongTimeoutMs: number;
  readonly initialBackoffMs: number;
  readonly maxBackoffMs: number;
}

export const REALTIME_OPTIONS = new InjectionToken<RealtimeOptions>('REALTIME_OPTIONS', {
  providedIn: 'root',
  factory: () => ({
    heartbeatMs: 30_000,
    pongTimeoutMs: 10_000,
    initialBackoffMs: 1_000,
    maxBackoffMs: 30_000,
  }),
});

const SOCKET_OPEN = 1;

/**
 * Live order updates over the WebSocket API (see contracts/realtime.ts).
 *
 * Connects while someone is signed in, reconnects with exponential backoff and
 * jitter, re-sends every active subscription after a reconnect, and pings to
 * detect dead connections. Consumers only call `orderUpdates()`:
 *
 *   this.realtime.orderUpdates(accountId)
 *     .pipe(takeUntilDestroyed())
 *     .subscribe((order) => ...);
 *
 * Subscriptions are reference-counted per account, so the server is told to
 * subscribe on the first consumer and to unsubscribe after the last one leaves.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly config = inject(AppConfig);
  private readonly auth = inject(AuthService);
  private readonly createSocket = inject(WEB_SOCKET_FACTORY);
  private readonly options = inject(REALTIME_OPTIONS);
  private readonly window = inject(DOCUMENT).defaultView;

  private readonly connectionState = signal<ConnectionState>('offline');
  readonly state = this.connectionState.asReadonly();

  private readonly messages = new Subject<ServerMessage>();
  private readonly subscriptions = new Map<string, number>();
  private socket: RealtimeSocket | null = null;
  private token: string | null = null;
  private attempt = 0;
  private reconnectTimer: Subscription | undefined;
  private heartbeat: Subscription | undefined;
  private pongTimeout: Subscription | undefined;

  constructor() {
    effect(() => {
      const token = this.auth.token();
      untracked(() => this.useToken(token));
    });

    const reconnectNow = () => {
      if (this.connectionState() === 'reconnecting' && this.token) {
        this.reconnectTimer?.unsubscribe();
        this.connect();
      }
    };
    this.window?.addEventListener('online', reconnectNow);

    inject(DestroyRef).onDestroy(() => {
      this.window?.removeEventListener('online', reconnectNow);
      this.useToken(null);
      this.messages.complete();
    });
  }

  /** Order updates for one account, or for every account with `'*'` (the default). */
  orderUpdates(accountId: string = ALL_ACCOUNTS): Observable<Order> {
    return new Observable<Order>((subscriber) => {
      const listener = this.messages.subscribe((message) => {
        if (
          message.type === 'order.updated' &&
          (accountId === ALL_ACCOUNTS || message.order.accountId === accountId)
        ) {
          subscriber.next(message.order);
        }
      });
      this.retain(accountId);
      return () => {
        listener.unsubscribe();
        this.release(accountId);
      };
    });
  }

  private useToken(token: string | null): void {
    if (token === this.token) {
      return;
    }
    this.token = token;
    this.attempt = 0;
    this.closeSocket();
    if (token) {
      this.connect();
    } else {
      this.connectionState.set('offline');
    }
  }

  private connect(): void {
    if (!this.token) {
      return;
    }
    const url = new URL(this.config.value.websocketUrl);
    url.searchParams.set('token', this.token);
    this.connectionState.set(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const socket = this.createSocket(url.toString());
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.connectionState.set('live');
      for (const accountId of this.subscriptions.keys()) {
        this.send({ action: 'subscribe', accountId });
      }
      this.startHeartbeat();
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    // An error is always followed by close; reconnecting is handled there.
    socket.onerror = () => undefined;
    socket.onclose = () => this.handleDrop();
  }

  private handleDrop(): void {
    this.closeSocket();
    this.connectionState.set('reconnecting');
    const ceiling = Math.min(
      this.options.maxBackoffMs,
      this.options.initialBackoffMs * 2 ** this.attempt,
    );
    // "Equal jitter": half fixed, half random, so clients do not reconnect in lockstep.
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);
    this.attempt += 1;
    this.reconnectTimer = timer(delay).subscribe(() => this.connect());
  }

  private handleMessage(data: unknown): void {
    // Any traffic proves the connection is alive.
    this.clearPongTimeout();
    if (typeof data !== 'string') {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      console.warn('Ignoring a realtime message that is not JSON.');
      return;
    }
    const message = ServerMessage.safeParse(json);
    if (!message.success) {
      console.warn(`Ignoring an unexpected realtime message:\n${z.prettifyError(message.error)}`);
      return;
    }
    this.messages.next(message.data);
  }

  private retain(accountId: string): void {
    const count = (this.subscriptions.get(accountId) ?? 0) + 1;
    this.subscriptions.set(accountId, count);
    if (count === 1) {
      this.send({ action: 'subscribe', accountId });
    }
  }

  private release(accountId: string): void {
    const count = (this.subscriptions.get(accountId) ?? 0) - 1;
    if (count > 0) {
      this.subscriptions.set(accountId, count);
      return;
    }
    this.subscriptions.delete(accountId);
    this.send({ action: 'unsubscribe', accountId });
  }

  /** Sends when connected; otherwise the next `onopen` re-sends what matters. */
  private send(message: ClientMessage): void {
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private startHeartbeat(): void {
    this.heartbeat?.unsubscribe();
    this.heartbeat = interval(this.options.heartbeatMs).subscribe(() => {
      this.send({ action: 'ping' });
      this.pongTimeout ??= timer(this.options.pongTimeoutMs).subscribe(() => this.handleDrop());
    });
  }

  private clearPongTimeout(): void {
    this.pongTimeout?.unsubscribe();
    this.pongTimeout = undefined;
  }

  /** Detaches and closes the current socket without triggering a reconnect. */
  private closeSocket(): void {
    this.reconnectTimer?.unsubscribe();
    this.heartbeat?.unsubscribe();
    this.clearPongTimeout();
    const socket = this.socket;
    if (socket) {
      this.socket = null;
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close(1000);
    }
  }
}
