import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { OrderStatus, OrderSummary } from '@provisioning/contracts';
import { EMPTY, switchMap } from 'rxjs';
import { OrdersApi } from '../../../../core/api/orders-api';
import { pagedList } from '../../../../core/api/paged-list';
import { RealtimeService } from '../../../../core/realtime/realtime';
import { injectQueryParamsUpdater, oneOf } from '../../../../core/routing/query-params';
import { resultCountLabel } from '../../../../shared/format/labels';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../../shared/ui/load-more/load-more';
import { TableSkeleton } from '../../../../shared/ui/table-skeleton/table-skeleton';
import { mergeLiveOrders, toOrderSummary } from '../../../orders/live-orders';
import { OrdersTable } from '../../../orders/orders-table/orders-table';
import { StatusFilter } from '../../../../shared/ui/status-filter/status-filter';
import { AccountStore } from '../account-store';

const STATUSES = OrderStatus.options;

@Component({
  selector: 'app-orders-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatIconModule,
    OrdersTable,
    RouterLink,
    StatusFilter,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-tab.html',
})
export class OrdersTab {
  /** Query parameter: `?status=<order status>`. */
  readonly status = input<string>();

  protected readonly store = inject(AccountStore);
  private readonly ordersApi = inject(OrdersApi);
  private readonly updateQuery = injectQueryParamsUpdater();

  protected readonly statusFilter = computed(() => oneOf(STATUSES, this.status()));
  protected readonly statuses = STATUSES;

  protected readonly orders = pagedList(
    () => {
      const accountId = this.store.accountId();
      return accountId ? { accountId, status: this.statusFilter() } : undefined;
    },
    (request) => this.ordersApi.list(request),
  );

  /** Orders pushed over the WebSocket since the list loaded, by id. */
  private readonly live = signal<ReadonlyMap<string, OrderSummary>>(new Map());

  protected readonly rows = computed(() => {
    const status = this.statusFilter();
    return mergeLiveOrders(
      this.orders.items(),
      this.live().values(),
      (order) => !status || order.status === status,
    );
  });

  protected readonly loadedCount = computed(() => {
    const loaded = this.rows().length;
    return resultCountLabel(loaded, loaded, this.orders.hasMore(), 'order');
  });

  constructor() {
    const realtime = inject(RealtimeService);
    toObservable(this.store.accountId)
      .pipe(
        switchMap((accountId) => (accountId ? realtime.orderUpdates(accountId) : EMPTY)),
        takeUntilDestroyed(),
      )
      .subscribe((order) =>
        this.live.update((live) => new Map(live).set(order.id, toOrderSummary(order))),
      );
  }

  protected setStatus(status: string | null): void {
    void this.updateQuery({ status });
  }
}
