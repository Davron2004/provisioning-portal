import { Account, AccountPlan, AccountStatus } from '@provisioning/contracts';

export const ACCOUNT_SORT_KEYS = ['name', 'plan', 'status', 'sites', 'users', 'numbers'] as const;
export type AccountSortKey = (typeof ACCOUNT_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export interface AccountFilter {
  readonly text: string;
  readonly status: AccountStatus | null;
  readonly plan: AccountPlan | null;
}

/** Share of the account's numbers in use, 0..1. */
export function numberUtilization(account: Account): number {
  return account.numbersTotal > 0 ? account.numbersAssigned / account.numbersTotal : 0;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim();

/** Text matches the name, id, or primary contact; accents and case are ignored. */
export function filterAccounts(
  accounts: readonly Account[],
  filter: AccountFilter,
): readonly Account[] {
  const text = normalize(filter.text);
  return accounts.filter(
    (account) =>
      (!filter.status || account.status === filter.status) &&
      (!filter.plan || account.plan === filter.plan) &&
      (!text ||
        [account.name, account.id, account.primaryContact.name, account.primaryContact.email].some(
          (field) => normalize(field).includes(text),
        )),
  );
}

const PLAN_RANK: Readonly<Record<AccountPlan, number>> = {
  essentials: 0,
  business: 1,
  enterprise: 2,
};
const STATUS_RANK: Readonly<Record<AccountStatus, number>> = {
  onboarding: 0,
  active: 1,
  suspended: 2,
};

const SORT_VALUE: Readonly<Record<AccountSortKey, (account: Account) => string | number>> = {
  name: (a) => a.name,
  plan: (a) => PLAN_RANK[a.plan],
  status: (a) => STATUS_RANK[a.status],
  sites: (a) => a.siteCount,
  users: (a) => a.userCount,
  numbers: numberUtilization,
};

const byName = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Stable sort; ties fall back to the name so the order never looks random. */
export function sortAccounts(
  accounts: readonly Account[],
  key: AccountSortKey,
  direction: SortDirection,
): readonly Account[] {
  const value = SORT_VALUE[key];
  const sign = direction === 'asc' ? 1 : -1;
  return [...accounts].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const primary =
      typeof x === 'string' && typeof y === 'string'
        ? byName.compare(x, y)
        : (x as number) - (y as number);
    return sign * primary || byName.compare(a.name, b.name);
  });
}
