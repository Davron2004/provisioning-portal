import { randomUUID } from 'node:crypto';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Client } from '@opensearch-project/opensearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepositories } from '../data/repositories';
import { userItem } from '../data/items';
import { generateSeed, type SeedData } from '../local/seed/generate';
import { seedItems, writeItems } from '../local/seed/write';
import { createTestTable, type TestTable } from '../test-support/dynamo';
import { user } from '../test-support/fixtures';
import { SearchIndexer } from './indexer';
import { cachedLookups } from './lookups';
import { reindexAll } from './reindex';
import { SearchService } from './search-service';

const endpoint =
  process.env.OPENSEARCH_ENDPOINT ?? `http://localhost:${process.env.OPENSEARCH_PORT ?? 9200}`;
const client = new Client({ node: endpoint });
const index = `test-${randomUUID()}`;
let table: TestTable;
let seed: SeedData;
let service: SearchService;

beforeAll(async () => {
  await client.cluster.health({ wait_for_status: 'yellow', timeout: '60s' });
  table = await createTestTable();
  seed = generateSeed(new Date('2026-11-21T18:00:00.000Z'));
  await writeItems(table.doc, table.tableName, seedItems(seed));
  const repos = createRepositories(table.doc, table.tableName);
  const count = await reindexAll({
    doc: table.doc,
    tableName: table.tableName,
    repos,
    search: client,
    index,
  });
  expect(count).toBe(seed.users.length + seed.numbers.length + seed.orders.length);
  service = new SearchService(client, index);
});

afterAll(async () => {
  await client.indices.delete({ index, ignore_unavailable: true });
  await table?.drop();
});

describe('search against OpenSearch', () => {
  const sofia = () => seed.users.find((u) => u.firstName === 'Sofia' && u.lastName === 'Beaulieu')!;

  it('finds a user by a name prefix and highlights it', async () => {
    const result = await service.search({ q: 'sofia beau', limit: 5 });
    expect(result.hits[0]).toMatchObject({
      entity: 'user',
      id: sofia().id,
      highlight: '<mark>Sofia</mark> <mark>Beaulieu</mark>',
    });
  });

  it('finds a user and their number by any way of writing the number', async () => {
    const did = sofia().did!;
    const local = did.slice(2);
    for (const q of [
      did,
      `+1 ${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`,
      local.slice(3),
    ]) {
      // The bare 555-01xx suffix exists in every area code, so it needs a larger page.
      const result = await service.search({ q, limit: 50 });
      const found = result.hits.map((h) => `${h.entity}:${h.id}`);
      expect(found, q).toContain(`user:${sofia().id}`);
      expect(found, q).toContain(`number:${did}`);
    }
  });

  it('finds a user by extension and filters by entity and account', async () => {
    const byExtension = await service.search({
      q: sofia().extension,
      accountId: sofia().accountId,
      limit: 5,
    });
    expect(byExtension.hits.map((h) => h.id)).toContain(sofia().id);

    const ordersOnly = await service.search({ q: 'kanata', entity: 'order', limit: 20 });
    expect(ordersOnly.hits.length).toBeGreaterThan(0);
    expect(ordersOnly.hits.every((h) => h.entity === 'order')).toBe(true);

    const otherAccount = await service.search({
      q: 'sofia beau',
      accountId: 'acc_hogsback',
      limit: 5,
    });
    expect(otherAccount.hits.map((h) => h.id)).not.toContain(sofia().id);
  });

  it('keeps up with stream changes and never returns raw HTML', async () => {
    const repos = createRepositories(table.doc, table.tableName);
    const indexer = new SearchIndexer(client, index, () => cachedLookups(repos));
    const sneaky = user({
      id: 'usr_xss',
      accountId: 'acc_lumen-ridge',
      siteId: 'site_lr-kanata',
      firstName: '<img src=x onerror=alert(1)>',
      lastName: 'Zed',
      extension: '2299',
    });
    await indexer.handle([
      { eventName: 'INSERT', dynamodb: { NewImage: marshallItem(userItem(sneaky)) } },
    ]);
    await client.indices.refresh({ index });

    const found = await service.search({ q: 'zed', limit: 5 });
    expect(found.hits[0]?.highlight).toBe('&lt;img src=x onerror=alert(1)&gt; <mark>Zed</mark>');

    await indexer.handle([
      { eventName: 'REMOVE', dynamodb: { OldImage: marshallItem(userItem(sneaky)) } },
    ]);
    await client.indices.refresh({ index });
    expect((await service.search({ q: 'zed', limit: 5 })).total).toBe(0);
  });
});

const marshallItem = (item: Record<string, unknown>) =>
  marshall(item, { removeUndefinedValues: true }) as never;
