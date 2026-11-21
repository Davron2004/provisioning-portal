import {
  CreateOrderRequest,
  OrderDraft,
  OrderStatus,
  type Order,
  type OrderSummaryPage,
} from '@provisioning/contracts';
import { NotFoundError } from '../../errors';
import type { OrderRecord } from '../../data/items';
import { parseBody, parseQuery } from '../parse';
import type { Router } from '../router';
import type { ApiDeps } from '../deps';
import { PageQuery, requireAccount } from './accounts';

const OrdersQuery = PageQuery.extend({ status: OrderStatus.optional() });

export function toApiOrder(record: OrderRecord): Order {
  const { version: _version, ...order } = record;
  return order;
}

export function registerOrderReadRoutes(router: Router, deps: ApiDeps): void {
  router.get('/orders', async ({ query }) => {
    const page: OrderSummaryPage = await deps.orders.listAll(parseQuery(OrdersQuery, query));
    return { status: 200, body: page };
  });

  router.get('/accounts/{accountId}/orders', async ({ params, query }) => {
    await requireAccount(deps, params.accountId!);
    const page: OrderSummaryPage = await deps.orders.listForAccount(
      params.accountId!,
      parseQuery(OrdersQuery, query),
    );
    return { status: 200, body: page };
  });

  router.get('/accounts/{accountId}/orders/{orderId}', async ({ params }) => {
    const order = await deps.orders.get(params.accountId!, params.orderId!);
    if (!order) throw new NotFoundError(`Order ${params.orderId} was not found`);
    return { status: 200, body: toApiOrder(order) };
  });
}

export function registerOrderWriteRoutes(router: Router, deps: ApiDeps): void {
  router.post('/accounts/{accountId}/orders/preview', async ({ params, body }) => {
    const draft = parseBody(OrderDraft, body);
    return { status: 200, body: await deps.orderService.preview(params.accountId!, draft) };
  });

  router.post('/accounts/{accountId}/orders', async ({ params, body, actor }) => {
    const request = parseBody(CreateOrderRequest, body);
    await requireAccount(deps, params.accountId!);
    const order = await deps.orderService.create(params.accountId!, request, actor);
    return { status: 202, body: toApiOrder(order) };
  });

  router.post('/accounts/{accountId}/orders/{orderId}/retry', async ({ params, actor }) => {
    const order = await deps.orderService.retry(params.accountId!, params.orderId!, actor);
    return { status: 202, body: toApiOrder(order) };
  });
}
