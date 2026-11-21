import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ALL_ACCOUNTS, OrderStatus, OrderSummary } from '@provisioning/contracts';
import { OrdersApi } from '../../../core/api/orders-api';
import { pagedList } from '../../../core/api/paged-list';
import { onRealtimeReconnect } from '../../../core/realtime/on-reconnect';
import { RealtimeService } from '../../../core/realtime/realtime';
import { injectQueryParamsUpdater, oneOf } from '../../../core/routing/query-params';
import { resultCountLabel } from '../../../shared/format/labels';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../shared/ui/load-more/load-more';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { mergeLiveOrders, toOrderSummary } from '../live-orders';
import { OrdersTable } from '../orders-table/orders-table';
import { StatusFilter } from '../../../shared/ui/status-filter/status-filter';

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
    MatIconModule,
    OrdersTable,
    PageHeader,
    RouterLink,
    StatusFilter,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-page.html',
})
export class OrdersPage {
  /** Query parameter: `?status=<order status>`. */
  readonly status = input<string>();

  private readonly ordersApi = inject(OrdersApi);
  private readonly updateQuery = injectQueryParamsUpdater();

  protected readonly statusFilter = computed(() => oneOf(STATUSES, this.status()));
  protected readonly statuses = STATUSES;

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

  protected setStatus(status: string | null): void {
    void this.updateQuery({ status: status || null });
  }
}
