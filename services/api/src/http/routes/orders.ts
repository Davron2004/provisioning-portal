import { OrderStatus, type Order, type OrderSummaryPage } from '@provisioning/contracts';
import { NotFoundError } from '../../errors';
import type { OrderRecord } from '../../data/items';
import { parseQuery } from '../parse';
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
