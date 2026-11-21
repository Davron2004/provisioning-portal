import { AccountPlan, DeviceModel, OrderSource, OrderSummary } from '@provisioning/contracts';

const PLAN_LABELS: Readonly<Record<AccountPlan, string>> = {
  essentials: 'Essentials',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function planLabel(plan: AccountPlan): string {
  return PLAN_LABELS[plan];
}

const SOURCE_LABELS: Readonly<Record<OrderSource, string>> = {
  manual: 'Manual',
  assistant: 'Assistant',
};

export function orderSourceLabel(source: OrderSource): string {
  return SOURCE_LABELS[source];
}

/** "Ada Lovelace". */
export function fullName(person: {
  readonly firstName: string;
  readonly lastName: string;
}): string {
  return `${person.firstName} ${person.lastName}`;
}

/** Device model id -> catalog name, falling back to the id for models the catalog no longer lists. */
export function deviceName(
  catalog: readonly DeviceModel[] | undefined,
  modelId: string | null | undefined,
): string | null {
  if (!modelId) {
    return null;
  }
  return catalog?.find((model) => model.id === modelId)?.name ?? modelId;
}

/** Plural-aware count: "1 user", "12 users". */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? singular : plural}`;
}

/** Line progress of an order in a few words: "2 of 3 done", "1 of 3 failed", "4 lines". */
export function orderProgressLabel(order: Pick<OrderSummary, 'status' | 'counts'>): string {
  const { total, succeeded, failed } = order.counts;
  if (failed > 0) {
    return `${failed} of ${total} failed`;
  }
  if (order.status === 'submitted' || order.status === 'validating') {
    return countOf(total, 'line');
  }
  return `${succeeded} of ${total} done`;
}

/**
 * The count above a list that may be filtered on the client and paginated:
 *
 *   all loaded, no filter         "5 accounts"
 *   more pages, total known       "25 of 91 users"
 *   more pages, total unknown     "First 25 users"
 *   filtered, all loaded          "3 of 5 accounts"
 *   filtered, more pages          "3 matches in the first 25 users" (filters only see loaded rows)
 */
export function resultCountLabel(
  shown: number,
  loaded: number,
  hasMore: boolean,
  singular: string,
  total?: number,
): string {
  const n = (count: number) => count.toLocaleString('en');
  const noun = (count: number) => (count === 1 ? singular : `${singular}s`);
  if (shown === loaded) {
    if (!hasMore) {
      return `${n(loaded)} ${noun(loaded)}`;
    }
    return total !== undefined && total > loaded
      ? `${n(loaded)} of ${n(total)} ${noun(total)}`
      : `First ${n(loaded)} ${noun(loaded)}`;
  }
  return hasMore
    ? `${n(shown)} ${shown === 1 ? 'match' : 'matches'} in the first ${n(loaded)} ${noun(loaded)}`
    : `${n(shown)} of ${n(loaded)} ${noun(loaded)}`;
}
