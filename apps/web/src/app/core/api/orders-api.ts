import { Injectable, inject } from '@angular/core';
import {
  ApiPaths,
  CreateOrderRequest,
  Order,
  OrderDraft,
  OrderPreview,
  OrderStatus,
  OrderSummaryPage,
} from '@provisioning/contracts';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export interface OrderListQuery {
  readonly status?: OrderStatus | null;
  readonly cursor?: string | null;
}

export interface AccountOrderListQuery extends OrderListQuery {
  readonly accountId: string;
}

export interface OrderRef {
  readonly accountId: string;
  readonly orderId: string;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly api = inject(ApiClient);

  /** Orders across every account, newest first. */
  listAll(query: () => OrderListQuery | undefined = () => ({})) {
    return this.api.resource(OrderSummaryPage, () => {
      const q = query();
      return q && { path: ApiPaths.allOrders(), params: { status: q.status, cursor: q.cursor } };
    });
  }

  list(query: () => AccountOrderListQuery | undefined) {
    return this.api.resource(OrderSummaryPage, () => {
      const q = query();
      return (
        q && { path: ApiPaths.orders(q.accountId), params: { status: q.status, cursor: q.cursor } }
      );
    });
  }

  get(ref: () => OrderRef | undefined) {
    return this.api.resource(Order, () => {
      const r = ref();
      return r && { path: ApiPaths.order(r.accountId, r.orderId) };
    });
  }

  /** Resolves and validates a draft without provisioning anything. */
  preview(accountId: string, draft: OrderDraft): Observable<OrderPreview> {
    return this.api.post(OrderPreview, ApiPaths.orderPreview(accountId), draft);
  }

  /** Submits a previewed order. The server re-validates every line. */
  create(accountId: string, request: CreateOrderRequest): Observable<Order> {
    return this.api.post(Order, ApiPaths.orders(accountId), request);
  }

  /** Retries the failed lines of an order. */
  retry(accountId: string, orderId: string): Observable<Order> {
    return this.api.post(Order, ApiPaths.orderRetry(accountId, orderId), {});
  }
}
