import { z } from 'zod';
import {
  NumberStatus,
  type Account,
  type AccountPage,
  type PhoneNumberPage,
  type SitePage,
  type VoiceUserPage,
} from '@provisioning/contracts';
import { NotFoundError } from '../../errors';
import { MAX_PAGE_SIZE } from '../../data/query';
import { parseQuery } from '../parse';
import type { Router } from '../router';
import type { ApiDeps } from '../deps';

export const PageQuery = z.object({
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

const UsersQuery = PageQuery.extend({
  siteId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
});
const NumbersQuery = PageQuery.extend({
  siteId: z.string().optional(),
  status: NumberStatus.optional(),
});

export async function requireAccount(deps: ApiDeps, accountId: string): Promise<Account> {
  const account = await deps.accounts.get(accountId);
  if (!account) throw new NotFoundError(`Account ${accountId} was not found`);
  return account;
}

export function registerAccountRoutes(router: Router, deps: ApiDeps): void {
  router.get('/accounts', async ({ query }) => {
    const page: AccountPage = await deps.accounts.list(parseQuery(PageQuery, query));
    return { status: 200, body: page };
  });

  router.get('/accounts/{accountId}', async ({ params }) => ({
    status: 200,
    body: await requireAccount(deps, params.accountId!),
  }));

  router.get('/accounts/{accountId}/sites', async ({ params }) => {
    await requireAccount(deps, params.accountId!);
    const page: SitePage = {
      items: await deps.accounts.listSites(params.accountId!),
      nextCursor: null,
    };
    return { status: 200, body: page };
  });

  router.get('/accounts/{accountId}/users', async ({ params, query }) => {
    await requireAccount(deps, params.accountId!);
    const page: VoiceUserPage = await deps.users.list(
      params.accountId!,
      parseQuery(UsersQuery, query),
    );
    return { status: 200, body: page };
  });

  router.get('/accounts/{accountId}/numbers', async ({ params, query }) => {
    await requireAccount(deps, params.accountId!);
    const page: PhoneNumberPage = await deps.numbers.list(
      params.accountId!,
      parseQuery(NumbersQuery, query),
    );
    return { status: 200, body: page };
  });
}
