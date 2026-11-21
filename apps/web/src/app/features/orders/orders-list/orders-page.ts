import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { ALL_ACCOUNTS, OrderStatus, OrderSummary } from '@provisioning/contracts';
import { OrdersApi } from '../../../core/api/orders-api';
import { pagedList } from '../../../core/api/paged-list';
import { onRealtimeReconnect } from '../../../core/realtime/on-reconnect';
import { RealtimeService } from '../../../core/realtime/realtime';
import { injectQueryParamsUpdater, oneOf } from '../../../core/routing/query-params';
import { orderSourceLabel, resultCountLabel } from '../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../shared/layout/media-query';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../shared/ui/load-more/load-more';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RelativeTime } from '../../../shared/ui/relative-time/relative-time';
import { statusStyle } from '../../../shared/ui/status-chip/status';
import { StatusChip } from '../../../shared/ui/status-chip/status-chip';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { mergeLiveOrders, toOrderSummary } from '../live-orders';

const STATUSES = OrderStatus.options;

/**
 * `/orders`: every account's orders, newest first, with a status filter in the URL
 * (`?status=failed`). Rows update in place as orders progress, and new orders appear
 * on top, from the all-accounts live feed.
 */
@Component({
  selector: 'app-orders-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatTableModule,
    PageHeader,
    RelativeTime,
    RouterLink,
    StatusChip,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-page.html',
  styleUrl: './orders-page.scss',
})
export class OrdersPage {
  /** Query parameter: `?status=<order status>`. */
  readonly status = input<string>();

  private readonly ordersApi = inject(OrdersApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly statusFilter = computed(() => oneOf(STATUSES, this.status()));
  protected readonly statusOptions = STATUSES.map((value) => ({
    value,
    label: statusStyle(value).label,
  }));

  protected readonly orders = pagedList(
    () => ({ status: this.statusFilter() }),
    (request) => this.ordersApi.listAll(request),
  );

  /** Orders pushed since the list loaded, by id. */
  private readonly live = signal<ReadonlyMap<string, OrderSummary>>(new Map());

  protected readonly rows = computed(() => {
    const status = this.statusFilter();
    return mergeLiveOrders(
      this.orders.items(),
      this.live().values(),
      (order) => !status || order.status === status,
    );
  });
  protected readonly resultCount = computed(() => {
    const shown = this.rows().length;
    return resultCountLabel(shown, shown, this.orders.hasMore(), 'order');
  });

  protected readonly columns = [
    'title',
    'account',
    'status',
    'progress',
    'source',
    'submittedBy',
    'updated',
  ];
  protected readonly sourceLabel = orderSourceLabel;
  protected readonly trackById = (_: number, order: OrderSummary) => order.id;

  constructor() {
    inject(RealtimeService)
      .orderUpdates(ALL_ACCOUNTS)
      .pipe(takeUntilDestroyed())
      .subscribe((order) =>
        this.live.update((live) => new Map(live).set(order.id, toOrderSummary(order))),
      );
    // Pushes sent while disconnected are lost; read the latest page again.
    onRealtimeReconnect(() => this.orders.retry());
  }

  /** Lines finished of all lines, and the share that succeeded and failed, for the meter. */
  protected progress(order: OrderSummary) {
    const { total, succeeded, failed } = order.counts;
    const share = (n: number) => (total ? `${(100 * n) / total}%` : '0%');
    return {
      done: succeeded + failed,
      total,
      failed,
      succeededWidth: share(succeeded),
      failedWidth: share(failed),
    };
  }

  protected setStatus(status: string | null | undefined): void {
    void this.updateQuery({ status: status || null });
  }
}
