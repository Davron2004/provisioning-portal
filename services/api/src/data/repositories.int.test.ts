import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateSeed, type SeedData } from '../local/seed/generate';
import { seedItems, writeItems } from '../local/seed/write';
import { createTestTable, type TestTable } from '../test-support/dynamo';
import { BadRequestError } from '../errors';
import { createRepositories, type Repositories } from './repositories';

let table: TestTable;
let repos: Repositories;
let seed: SeedData;

beforeAll(async () => {
  table = await createTestTable();
  seed = generateSeed(new Date('2026-11-21T18:00:00.000Z'));
  await writeItems(table.doc, table.tableName, seedItems(seed));
  repos = createRepositories(table.doc, table.tableName);
});

afterAll(() => table?.drop());

async function collect<T>(
  fetch: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<{ items: T[]; pages: number }> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await fetch(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor);
  return { items, pages };
}

describe('repositories against DynamoDB Local', () => {
  it('pages through accounts in name order', async () => {
    const { items, pages } = await collect((cursor) => repos.accounts.list({ cursor, limit: 2 }));
    expect(pages).toBe(3);
    expect(items.map((a) => a.name)).toEqual(seed.accounts.map((a) => a.name).sort());
    expect(await repos.accounts.get('acc_lumen-ridge')).toMatchObject({
      name: 'Lumen Ridge Robotics',
    });
    expect(await repos.accounts.get('acc_missing')).toBeNull();
  });

  it('lists sites and users by site in last-name order', async () => {
    const sites = await repos.accounts.listSites('acc_lumen-ridge');
    expect(sites.map((s) => s.name)).toEqual([
      'Gatineau Office',
      'Kanata Campus',
      'Ottawa HQ',
      'Toronto Lab',
    ]);

    const { items } = await collect((cursor) =>
      repos.users.list('acc_lumen-ridge', { siteId: 'site_lr-kanata', cursor, limit: 10 }),
    );
    const expected = seed.users.filter((u) => u.siteId === 'site_lr-kanata');
    expect(items).toHaveLength(expected.length);
    const lastNames = items.map((u) => u.lastName.toLowerCase());
    expect(lastNames).toEqual([...lastNames].sort());
    // API objects never leak key attributes.
    expect(Object.keys(items[0]!)).not.toContain('PK');
  });

  it('does not list another account’s site through a guessed site id', async () => {
    const page = await repos.users.list('acc_carling-pine', { siteId: 'site_lr-kanata' });
    expect(page.items).toHaveLength(0);
  });

  it('filters users by text with full pages and a working cursor', async () => {
    const accountUsers = seed.users.filter((u) => u.accountId === 'acc_lumen-ridge');
    const target = accountUsers.find((u) => u.did)!;
    const digits = target.did!.slice(-7);
    const spaced = `${target.did!.slice(2, 5)} ${target.did!.slice(5, 8)} ${target.did!.slice(8)}`;

    for (const q of [digits, spaced, target.lastName.toUpperCase()]) {
      const { items } = await collect((cursor) =>
        repos.users.list('acc_lumen-ridge', { q, cursor, limit: 100 }),
      );
      expect(
        items.map((u) => u.id),
        q,
      ).toContain(target.id);
    }

    // A single-character filter matches many users: pages must be full except the last,
    // and paging must return exactly the same users, in order, as one big page.
    const q = 'a';
    const whole = await repos.users.list('acc_lumen-ridge', { q, limit: 100 });
    expect(whole.items.length).toBeGreaterThan(7);
    const sizes: number[] = [];
    const { items } = await collect(async (cursor) => {
      const page = await repos.users.list('acc_lumen-ridge', { q, cursor, limit: 7 });
      sizes.push(page.items.length);
      return page;
    });
    expect(items.map((u) => u.id)).toEqual(whole.items.map((u) => u.id));
    expect(sizes.slice(0, -1).every((n) => n === 7)).toBe(true);
    expect(sizes.at(-1)).toBeGreaterThan(0);

    // A query matching one user returns it on the first page with no cursor.
    const one = await repos.users.list('acc_lumen-ridge', { q: target.email, limit: 5 });
    expect(one.items.map((u) => u.id)).toEqual([target.id]);
    expect(one.nextCursor).toBeNull();

    const none = await repos.users.list('acc_lumen-ridge', { q: 'zzzzqqq' });
    expect(none).toEqual({ items: [], nextCursor: null });

    // Site scoping still holds.
    const site = await repos.users.list('acc_lumen-ridge', {
      siteId: 'site_lr-kanata',
      q,
      limit: 100,
    });
    expect(site.items.every((u) => u.siteId === 'site_lr-kanata')).toBe(true);
  });

  it('filters numbers by site and status', async () => {
    const page = await repos.numbers.list('acc_lumen-ridge', {
      siteId: 'site_lr-kanata',
      status: 'available',
      limit: 100,
    });
    const expected = seed.numbers
      .filter((n) => n.siteId === 'site_lr-kanata' && n.status === 'available')
      .map((n) => n.e164)
      .sort();
    expect(page.items.map((n) => n.e164)).toEqual(expected);

    const reserved = await repos.numbers.list('acc_lumen-ridge', { status: 'reserved' });
    expect(reserved.items.every((n) => n.status === 'reserved' && n.orderId)).toBe(true);
    expect(reserved.items.length).toBeGreaterThan(0);
  });

  it('lists orders newest first, per account and across accounts', async () => {
    const all = await collect((cursor) => repos.orders.listAll({ cursor, limit: 5 }));
    expect(all.items).toHaveLength(seed.orders.length);
    const created = all.items.map((o) => o.createdAt);
    expect(created).toEqual([...created].sort().reverse());

    const failed = await repos.orders.listAll({ status: 'failed' });
    expect(failed.items.map((o) => o.status)).toEqual(['failed', 'failed']);

    const lumenFailed = await repos.orders.listForAccount('acc_lumen-ridge', {
      status: 'failed',
      limit: 1,
    });
    expect(lumenFailed.items).toHaveLength(1);
    expect(lumenFailed.items[0]).toMatchObject({ accountId: 'acc_lumen-ridge', status: 'failed' });
    expect(lumenFailed.items[0]).not.toHaveProperty('lines');

    const counts = await repos.orders.countByStatus();
    expect(counts).toEqual({ submitted: 0, validating: 0, provisioning: 0, active: 10, failed: 2 });
  });

  it('rejects a cursor from a different list', async () => {
    const page = await repos.users.list('acc_lumen-ridge', { limit: 1 });
    await expect(
      repos.users.list('acc_carling-pine', { cursor: page.nextCursor, limit: 1 }),
    ).rejects.toThrow(BadRequestError);
  });
});
