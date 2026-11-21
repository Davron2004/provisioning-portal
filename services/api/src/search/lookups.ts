import type { Repositories } from '../data/repositories';
import type { SearchLookups } from './documents';

/**
 * Repository-backed lookups with a cache. The indexer makes a fresh one per
 * stream batch (so a renamed site is picked up on the next batch); the
 * reindex job keeps one for the whole run.
 */
export function cachedLookups(repos: Pick<Repositories, 'accounts' | 'users'>): SearchLookups {
  const cache = new Map<string, Promise<string | null>>();
  const once = (key: string, load: () => Promise<string | null>) => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key)!;
  };
  return {
    accountName: async (accountId) =>
      (await once(
        `a:${accountId}`,
        async () => (await repos.accounts.get(accountId))?.name ?? null,
      )) ?? accountId,
    siteName: async (accountId, siteId) =>
      (await once(
        `s:${siteId}`,
        async () => (await repos.accounts.getSite(accountId, siteId))?.name ?? null,
      )) ?? siteId,
    userName: (accountId, userId) =>
      once(`u:${userId}`, async () => {
        const user = await repos.users.get(accountId, userId);
        return user ? `${user.firstName} ${user.lastName}` : null;
      }),
  };
}
