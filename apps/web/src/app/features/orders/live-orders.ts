import { Order, OrderStatus, OrderSummary, Overview } from '@provisioning/contracts';

/** The summary part of a pushed order; lines and events are dropped from list state. */
export function toOrderSummary(order: Order | OrderSummary): OrderSummary {
  const {
    id,
    accountId,
    accountName,
    status,
    source,
    title,
    counts,
    submittedBy,
    createdAt,
    updatedAt,
    completedAt,
  } = order;
  return {
    id,
    accountId,
    accountName,
    status,
    source,
    title,
    counts,
    submittedBy,
    createdAt,
    updatedAt,
    completedAt,
  };
}

const newestFirst = (a: OrderSummary, b: OrderSummary) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

const isNewer = (candidate: OrderSummary, current: OrderSummary) =>
  candidate.updatedAt >= current.updatedAt;

/**
 * Overlays live order updates on a newest-first list from the API.
 *
 * - An order already in the list is replaced when the update is at least as recent,
 *   so a later reload of the list (which is fresher) always wins over a stale push.
 * - An order not in the list is added only when it is newer than everything listed
 *   (a new order belongs at the top; an older one belongs to a page not loaded yet)
 *   and `include` accepts it (for example, it matches the list's status filter).
 */
export function mergeLiveOrders(
  listed: readonly OrderSummary[],
  live: Iterable<OrderSummary>,
  include: (order: OrderSummary) => boolean = () => true,
): readonly OrderSummary[] {
  const updates = new Map<string, OrderSummary>();
  for (const order of live) {
    updates.set(order.id, order);
  }
  if (updates.size === 0) {
    return listed;
  }
  const listedIds = new Set(listed.map((order) => order.id));
  const merged = listed.map((order) => {
    const update = updates.get(order.id);
    return update && isNewer(update, order) ? update : order;
  });
  const newest = listed[0];
  const added = [...updates.values()]
    .filter(
      (order) =>
        !listedIds.has(order.id) && (!newest || newestFirst(order, newest) < 0) && include(order),
    )
    .sort(newestFirst);
  return added.length > 0 ? [...added, ...merged] : merged;
}

/** How many recent orders /overview returns. */
export const RECENT_ORDER_LIMIT = 8;

/**
 * Applies a pushed order to the overview right away: the recent list, and the
 * per-status counts when the order's previous status is known (it is in the recent
 * list) or it is brand new. Anything else is reconciled by the next reload.
 */
export function applyOrderToOverview(overview: Overview, order: Order | OrderSummary): Overview {
  const summary = toOrderSummary(order);
  const previous = overview.recentOrders.find((o) => o.id === summary.id);
  if (previous && !isNewer(summary, previous)) {
    return overview;
  }
  const counts: Record<OrderStatus, number> = { ...overview.ordersByStatus };
  if (previous && previous.status !== summary.status) {
    counts[previous.status] = Math.max(0, counts[previous.status] - 1);
    counts[summary.status] += 1;
  } else if (!previous && summary.createdAt > overview.generatedAt) {
    counts[summary.status] += 1;
  }
  const others = overview.recentOrders.filter((o) => o.id !== summary.id);
  return {
    ...overview,
    ordersByStatus: counts,
    recentOrders: [summary, ...others].sort(newestFirst).slice(0, RECENT_ORDER_LIMIT),
  };
}
