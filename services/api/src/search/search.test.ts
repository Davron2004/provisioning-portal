import { marshall } from '@aws-sdk/util-dynamodb';
import type { Client } from '@opensearch-project/opensearch';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { numberItem, orderItem, userItem } from '../data/items';
import { createOrder } from '../domain/order-lifecycle';
import { toSnapshot } from '../domain/snapshots';
import { number, user } from '../test-support/fixtures';
import {
  formatE164,
  numberDocument,
  orderDocument,
  userDocument,
  type SearchLookups,
} from './documents';
import { SearchIndexer } from './indexer';
import {
  buildSearchQuery,
  safeHighlight,
  SearchService,
  toSearchHit,
  toTotals,
} from './search-service';

const lookups: SearchLookups = {
  accountName: async () => 'Test Co',
  siteName: async () => 'Kanata Campus',
  userName: async (_a, id) => (id === 'u1' ? 'Sofia Beaulieu' : null),
};
const priya = user({
  id: 'u1',
  firstName: 'Priya',
  lastName: 'Shah',
  extension: '2104',
  did: '+16135550142',
});

describe('search documents', () => {
  it('formats North American numbers', () => {
    expect(formatE164('+16135550142')).toBe('(613) 555-0142');
  });

  it('describes a user with name, extension, number and site, and every way to type the number', async () => {
    const doc = await userDocument(priya, lookups);
    expect(doc).toMatchObject({
      entity: 'user',
      id: 'u1',
      title: 'Priya Shah',
      subtitle: 'Ext 2104 · (613) 555-0142 · Kanata Campus',
      status: 'active',
      digits: ['2104', '16135550142', '6135550142'],
      text: ['u1@test.example.com', 'Kanata Campus', 'Test Co'],
    });
  });

  it('says who holds a number', async () => {
    const assigned = await numberDocument(
      number('+16135550142', 'site_k', 'assigned', 'u1'),
      lookups,
    );
    expect(assigned.subtitle).toBe('Kanata Campus · Assigned to Sofia Beaulieu');
    const available = await numberDocument(number('+16135550143', 'site_k'), lookups);
    expect(available).toMatchObject({
      title: '(613) 555-0143',
      subtitle: 'Kanata Campus · Available',
    });
  });

  it('makes orders findable by the people they touch', () => {
    const order = createOrder({
      id: 'ord_1',
      accountId: 'acc_test',
      accountName: 'Test Co',
      lines: [{ action: 'remove_user', userId: 'u1', before: toSnapshot(priya) }],
      siteNames: new Map([['site_k', 'Kanata Campus']]),
      source: 'assistant',
      prompt: 'remove extension 2104',
      submittedBy: 'admin@example.com',
      now: new Date('2026-11-21T15:00:00.000Z'),
    });
    expect(orderDocument(order)).toMatchObject({
      title: 'Remove Priya Shah at Kanata Campus',
      subtitle: '1 line · submitted by admin@example.com',
      text: expect.arrayContaining(['ord_1', 'remove extension 2104', 'Priya Shah']),
    });
  });
});

describe('search query and results', () => {
  it('adds a digit clause only for 3+ digits and applies filters', () => {
    const named = buildSearchQuery({ q: 'Priya', limit: 20 });
    expect(JSON.stringify(named.query)).not.toContain('digits');
    const numbered = buildSearchQuery({
      q: '(613) 555-0142',
      entity: 'user',
      accountId: 'acc_a',
      limit: 5,
    });
    expect(numbered.size).toBe(5);
    expect(numbered.query.bool.should).toContainEqual({
      term: { digits: { value: '6135550142', boost: 2 } },
    });
    expect(numbered.query.bool.filter).toEqual([{ term: { accountId: 'acc_a' } }]);
    expect(numbered.post_filter).toEqual({ term: { entity: 'user' } });
    expect(named.post_filter).toBeUndefined();
  });

  it('counts every entity, whatever the entity filter, for the chip totals', () => {
    const query = buildSearchQuery({ q: 'Priya', entity: 'order', limit: 20 });
    // The entity filter is a post_filter, so it narrows the hits but not the aggregation.
    expect(query.query.bool.filter).toEqual([]);
    expect(query.aggs).toEqual({ entities: { terms: { field: 'entity', size: 3 } } });
  });

  it('fills a total for every entity, 0 when nothing matched', () => {
    expect(
      toTotals([
        { key: 'user', doc_count: 4 },
        { key: 'order', doc_count: 2 },
        { key: 'unexpected', doc_count: 9 },
      ]),
    ).toEqual({ user: 4, number: 0, order: 2 });
    expect(toTotals()).toEqual({ user: 0, number: 0, order: 0 });
  });

  it('escapes highlighted text so only <mark> survives', () => {
    const fragment = '<img src=x onerror=alert(1)> & "Shah"';
    expect(safeHighlight(fragment)).toBe(
      '<mark>&lt;img src=x onerror=alert(1)&gt;</mark> &amp; &quot;Shah&quot;',
    );
  });

  it('prefers a title highlight and falls back to the subtitle', () => {
    const source = {
      entity: 'user' as const,
      id: 'u1',
      accountId: 'a',
      accountName: 'A',
      title: 'Priya Shah',
      subtitle: 'Ext 2104',
      status: 'active',
      text: [],
      digits: [],
      updatedAt: '2026-11-21T15:00:00.000Z',
    };
    expect(
      toSearchHit({ _source: source, highlight: { subtitle: ['Ext 2104'] } })?.highlight,
    ).toBe('Ext <mark>2104</mark>');
    expect(
      toSearchHit({ _source: source, highlight: { title: ['Priya Shah'], subtitle: ['x'] } })
        ?.highlight,
    ).toBe('<mark>Priya</mark> Shah');
    expect(toSearchHit({ _source: source })?.highlight).toBeNull();
  });

  it('maps an OpenSearch response and treats a missing index as no results', async () => {
    const search = vi.fn(async () => ({
      body: {
        took: 7,
        hits: {
          total: { value: 1 },
          hits: [{ _source: { ...(await userDocument(priya, lookups)) } }],
        },
        aggregations: { entities: { buckets: [{ key: 'user', doc_count: 1 }] } },
      },
    }));
    const service = new SearchService({ search } as unknown as Client, 'idx');
    const result = await service.search({ q: 'pri', limit: 10 });
    expect(result).toMatchObject({
      query: 'pri',
      total: 1,
      totals: { user: 1, number: 0, order: 0 },
      tookMs: 7,
    });
    expect(result.hits[0]).toMatchObject({ entity: 'user', title: 'Priya Shah', highlight: null });

    const missing = new SearchService(
      {
        search: async () => {
          throw Object.assign(new Error('no index'), {
            meta: { body: { error: { type: 'index_not_found_exception' } } },
          });
        },
      } as unknown as Client,
      'idx',
    );
    await expect(missing.search({ q: 'x', limit: 10 })).resolves.toMatchObject({
      total: 0,
      totals: { user: 0, number: 0, order: 0 },
      hits: [],
    });
  });
});

describe('SearchIndexer', () => {
  const record = (
    item: Record<string, unknown>,
    eventName: DynamoDBRecord['eventName'] = 'MODIFY',
  ) => ({
    eventName,
    dynamodb: {
      [eventName === 'REMOVE' ? 'OldImage' : 'NewImage']: marshall(item, {
        removeUndefinedValues: true,
      }) as Record<string, AttributeValue>,
    },
  });

  function indexer(items: { index?: { status: number }; delete?: { status: number } }[] = []) {
    const bulk = vi.fn(async (_req: { index?: string; body: object[] }) => ({ body: { items } }));
    const exists = vi.fn(async () => ({ body: true }));
    const client = { bulk, indices: { exists, create: vi.fn() } } as unknown as Client;
    return { bulk, exists, indexer: new SearchIndexer(client, 'idx', () => lookups) };
  }

  it('upserts users, numbers and orders and deletes removed items in one bulk request', async () => {
    const { indexer: subject, bulk, exists } = indexer();
    const order = createOrder({
      id: 'ord_1',
      accountId: 'acc_test',
      accountName: 'Test Co',
      lines: [],
      siteNames: new Map(),
      source: 'manual',
      prompt: null,
      submittedBy: 'admin@example.com',
      now: new Date(),
    });
    const result = await subject.handle([
      record(userItem({ ...priya, voicemail: false })),
      record(userItem(priya)),
      record(numberItem(number('+16135550142', 'site_k', 'assigned', 'u1'))),
      record(orderItem({ ...order, version: 1 })),
      record(userItem(user({ id: 'u9' })), 'REMOVE'),
      record({ PK: 'MAC#x', SK: 'MAC', entity: 'Guard' }),
    ]);
    expect(result).toEqual({ indexed: 3, deleted: 1 });
    expect(bulk.mock.calls[0]![0].index).toBe('idx');
    const body = bulk.mock.calls[0]![0].body;
    expect(body).toContainEqual({ index: { _index: 'idx', _id: 'user:u1' } });
    expect(body).toContainEqual({ delete: { _index: 'idx', _id: 'user:u9' } });
    expect(body).toContainEqual({ index: { _index: 'idx', _id: 'number:+16135550142' } });
    expect(body).toContainEqual({ index: { _index: 'idx', _id: 'order:ord_1' } });
    // Only the last image of u1 is sent.
    expect(
      body.filter((op) => JSON.stringify(op) === '{"index":{"_index":"idx","_id":"user:u1"}}'),
    ).toHaveLength(1);

    await subject.handle([record(userItem(priya))]);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('fails the batch when OpenSearch rejects a document, but not for deleting a missing one', async () => {
    await expect(
      indexer([{ delete: { status: 404 } }]).indexer.handle([record(userItem(priya), 'REMOVE')]),
    ).resolves.toEqual({ indexed: 0, deleted: 1 });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      indexer([{ index: { status: 400 } }]).indexer.handle([record(userItem(priya))]),
    ).rejects.toThrow('1 search index operations failed');
    spy.mockRestore();
  });
});
