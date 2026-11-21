import type { DraftLine, ResolvedLine } from '@provisioning/contracts';
import type { Repositories } from '../data/repositories';
import { macAddressesIn, type AccountContext } from '../domain/order-validation';
import { NotFoundError } from '../errors';

/** Loads what the order rules need to know about an account (see domain/order-validation.ts). */
export async function loadAccountContext(
  repos: Repositories,
  accountId: string,
  lines: readonly (ResolvedLine | DraftLine)[],
): Promise<AccountContext> {
  const [account, sites, users, numbers, macOwners] = await Promise.all([
    repos.accounts.get(accountId),
    repos.accounts.listSites(accountId),
    repos.users.listAll(accountId),
    repos.numbers.listAll(accountId),
    repos.provisioning.macOwners(macAddressesIn(lines)),
  ]);
  if (!account) throw new NotFoundError(`Account ${accountId} was not found`);
  return { account, sites, users, numbers, macOwners };
}
