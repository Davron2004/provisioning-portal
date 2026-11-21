import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Order, OrderLine, TERMINAL_ORDER_STATUSES } from '@provisioning/contracts';
import { filter, switchMap } from 'rxjs';
import { toApiProblem } from '../../../core/api/api-problem';
import { OrdersApi } from '../../../core/api/orders-api';
import { NotificationService } from '../../../core/notifications/notification';
import { onRealtimeReconnect } from '../../../core/realtime/on-reconnect';
import { RealtimeService } from '../../../core/realtime/realtime';
import { orderSourceLabel } from '../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../shared/layout/media-query';
import { PhoneNumberPipe } from '../../../shared/pipes/phone-number.pipe';
import { formatDuration } from '../../../shared/time/format-time';
import { Breadcrumb, Breadcrumbs } from '../../../shared/ui/breadcrumbs/breadcrumbs';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RelativeTime } from '../../../shared/ui/relative-time/relative-time';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { StatusChip } from '../../../shared/ui/status-chip/status-chip';
import { ActionBadge } from '../order-review/action-badge';
import { LineStep } from './line-step';
import { latestOrder, optimisticRetry, statusAnnouncement } from './live-order';
import { OrderProgress } from './order-progress';
import { OrderTimeline } from './order-timeline';

/** While live updates are down, poll an unfinished order this often instead. */
const FALLBACK_POLL_MS = 5_000;

/**
 * `/accounts/:accountId/orders/:orderId`: an order as it is provisioned, live.
 *
 * The order is fetched once, then kept current by WebSocket pushes for its account.
 * Pushes are best effort, so the page re-fetches after a reconnect, and polls while
 * the connection is down and the order is still running.
 */
@Component({
  selector: 'app-order-detail-page',
  imports: [
    ActionBadge,
    Breadcrumbs,
    ErrorState,
    LineStep,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    OrderProgress,
    OrderTimeline,
    PageHeader,
    PhoneNumberPipe,
    RelativeTime,
    Skeleton,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail-page.html',
  styleUrl: './order-detail-page.scss',
})
export class OrderDetailPage {
  /** Route parameters (bound with withComponentInputBinding). */
  readonly accountId = input.required<string>();
  readonly orderId = input.required<string>();

  private readonly ordersApi = inject(OrdersApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly realtime = inject(RealtimeService);
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly resource = this.ordersApi.get(() => ({
    accountId: this.accountId(),
    orderId: this.orderId(),
  }));

  /** The freshest version seen, fetched or pushed. */
  protected readonly order = linkedSignal<Order | undefined, Order | undefined>({
    source: () => (this.resource.hasValue() ? this.resource.value() : undefined),
    computation: (fetched, previous) => latestOrder(previous?.value, fetched),
  });

  protected readonly retrying = signal(false);
  /** The last status change, for screen readers. */
  protected readonly announcement = signal('');

  protected readonly running = computed(() => {
    const order = this.order();
    return !!order && !TERMINAL_ORDER_STATUSES.includes(order.status);
  });
  protected readonly canRetry = computed(() => this.order()?.status === 'failed');
  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => {
    const order = this.order();
    return [
      { label: 'Orders', link: '/orders' },
      {
        label: order?.accountName ?? 'Account',
        link: ['/accounts', this.accountId(), 'orders'],
      },
      { label: order?.title ?? 'Order' },
    ];
  });
  protected readonly duration = computed(() => {
    const order = this.order();
    return order?.completedAt ? formatDuration(order.createdAt, order.completedAt) : null;
  });
  protected readonly liveLabel = computed(() => {
    switch (this.realtime.state()) {
      case 'live':
        return 'Live';
      case 'reconnecting':
        return 'Reconnecting';
      case 'connecting':
        return 'Connecting';
      default:
        return 'Offline';
    }
  });

  protected readonly sourceLabel = orderSourceLabel;

  constructor() {
    // Merge pushes for this order as they arrive.
    toObservable(this.accountId)
      .pipe(
        switchMap((accountId) => this.realtime.orderUpdates(accountId)),
        filter((order) => order.id === this.orderId()),
        takeUntilDestroyed(),
      )
      .subscribe((order) => this.order.update((current) => latestOrder(current, order)));

    // Anything pushed while disconnected is lost: fetch again once back.
    onRealtimeReconnect(() => this.resource.reload());

    // Without a connection, an unfinished order is polled so it never looks stuck.
    effect((onCleanup) => {
      if (!this.running() || this.realtime.state() === 'live') {
        return;
      }
      const timer = setInterval(() => this.resource.reload(), FALLBACK_POLL_MS);
      onCleanup(() => clearInterval(timer));
    });

    // Announce status changes politely, once each, not every step.
    let announced: string | undefined;
    effect(() => {
      const order = this.order();
      if (!order) {
        return;
      }
      const key = `${order.id}:${order.status}`;
      if (announced !== undefined && announced !== key) {
        untracked(() => this.announcement.set(statusAnnouncement(order)));
      }
      announced = key;
    });

    toObservable(this.orderId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.announcement.set(''));
  }

  protected retry(): void {
    const order = this.order();
    if (!order || order.status !== 'failed' || this.retrying()) {
      return;
    }
    this.retrying.set(true);
    this.order.set(optimisticRetry(order));
    this.ordersApi
      .retry(order.accountId, order.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.retrying.set(false);
          this.order.update((current) => latestOrder(current, updated));
          this.notifications.info('Retrying the failed lines.');
        },
        error: (error: unknown) => {
          this.retrying.set(false);
          // Put back what the server has: the retry may have been refused because
          // the order already moved on (409), or not have reached it at all.
          this.order.set(order);
          this.resource.reload();
          const problem = toApiProblem(error);
          this.notifications.error(
            problem.code === 'conflict'
              ? 'This order is not failed any more, so there is nothing to retry.'
              : error,
          );
        },
      });
  }

  protected userOf(line: OrderLine) {
    return line.action === 'add_user' ? line.user : line.before;
  }

  protected readonly trackLine = (_: number, line: OrderLine) => line.lineId;
}
