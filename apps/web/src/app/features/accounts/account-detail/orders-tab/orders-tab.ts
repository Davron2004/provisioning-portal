import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { OrderStatus, OrderSummary } from '@provisioning/contracts';
import { EMPTY, switchMap } from 'rxjs';
import { OrdersApi } from '../../../../core/api/orders-api';
import { pagedList } from '../../../../core/api/paged-list';
import { RealtimeService } from '../../../../core/realtime/realtime';
import { injectQueryParamsUpdater, oneOf } from '../../../../core/routing/query-params';
import {
  orderProgressLabel,
  orderSourceLabel,
  resultCountLabel,
} from '../../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../../shared/layout/media-query';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../../shared/ui/load-more/load-more';
import { RelativeTime } from '../../../../shared/ui/relative-time/relative-time';
import { statusStyle } from '../../../../shared/ui/status-chip/status';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { TableSkeleton } from '../../../../shared/ui/table-skeleton/table-skeleton';
import { mergeLiveOrders, toOrderSummary } from '../../../orders/live-orders';
import { AccountStore } from '../account-store';

const STATUSES = OrderStatus.options;

@Component({
  selector: 'app-orders-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTableModule,
    RelativeTime,
    RouterLink,
    StatusChip,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-tab.html',
  styleUrl: './orders-tab.scss',
})
export class OrdersTab {
  /** Query parameter: `?status=<order status>`. */
  readonly status = input<string>();

  protected readonly store = inject(AccountStore);
  private readonly ordersApi = inject(OrdersApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly statusFilter = computed(() => oneOf(STATUSES, this.status()));
  protected readonly statusOptions = STATUSES.map((value) => ({
    value,
    label: statusStyle(value).label,
  }));

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

  protected readonly columns = ['title', 'status', 'progress', 'source', 'submittedBy', 'updated'];
  protected readonly loadedCount = computed(() => {
    const loaded = this.rows().length;
    return resultCountLabel(loaded, loaded, this.orders.hasMore(), 'order');
  });
  protected readonly progress = orderProgressLabel;
  protected readonly sourceLabel = orderSourceLabel;
  protected readonly trackById = (_: number, order: OrderSummary) => order.id;

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
