import { z } from 'zod';
import { SearchEntity } from '@provisioning/contracts';
import { parseQuery } from '../parse';
import type { Router } from '../router';
import type { ApiDeps } from '../deps';

const SearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
  entity: SearchEntity.optional(),
  accountId: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerSearchRoutes(router: Router, deps: ApiDeps): void {
  router.get('/search', async ({ query }) => ({
    status: 200,
    body: await deps.search.search(parseQuery(SearchQuery, query)),
  }));
}
