import { describe, expect, it } from 'vitest';
import { Account, Order, PhoneNumber, Site, VoiceUser } from '@provisioning/contracts';
import { findDevice } from '../../domain/catalog';
import { userGuardItems } from '../../data/items';
import { generateSeed } from './generate';
import { seedItems } from './write';

const now = new Date('2026-11-21T18:00:00.000Z');
const data = generateSeed(now);

describe('generateSeed', () => {
  it('produces contract-valid objects', () => {
    data.accounts.forEach((a) => Account.parse(a));
    data.sites.forEach((s) => Site.parse(s));
    data.users.forEach((u) => VoiceUser.parse(u));
    data.numbers.forEach((n) => PhoneNumber.parse(n));
    data.orders.forEach((o) => Order.parse(o));
  });

  it('is deterministic for a given seed and time', () => {
    expect(generateSeed(now)).toEqual(data);
  });

  it('has a realistic size', () => {
    expect(data.accounts).toHaveLength(5);
    expect(data.users.length).toBeGreaterThanOrEqual(150);
    expect(data.users.length).toBeLessThanOrEqual(250);
    for (const account of data.accounts) {
      const sites = data.sites.filter((s) => s.accountId === account.id);
      expect(sites.length).toBeGreaterThanOrEqual(2);
      expect(sites.length).toBeLessThanOrEqual(4);
    }
  });

  it('only uses fictional 555-01xx numbers, each exactly once', () => {
    const e164s = data.numbers.map((n) => n.e164);
    expect(new Set(e164s).size).toBe(e164s.length);
    for (const e164 of e164s) expect(e164).toMatch(/^\+1\d{3}5550[1]\d{2}$/);
    expect(new Set(e164s.map((n) => n.slice(2, 5))).size).toBeGreaterThanOrEqual(6);
  });

  it('keeps users consistent with their site, numbers and the catalog', () => {
    const sites = new Map(data.sites.map((s) => [s.id, s]));
    const numbers = new Map(data.numbers.map((n) => [n.e164, n]));
    for (const user of data.users) {
      const site = sites.get(user.siteId)!;
      expect(site.accountId).toBe(user.accountId);
      const ext = Number(user.extension);
      expect(ext).toBeGreaterThanOrEqual(Number(site.extensionRange.start));
      expect(ext).toBeLessThanOrEqual(Number(site.extensionRange.end));
      if (user.did) {
        const number = numbers.get(user.did)!;
        expect(number).toMatchObject({ siteId: user.siteId, userId: user.id });
        // A failed add keeps its number reserved by the order until the line is retried.
        if (number.status === 'reserved') {
          expect(user.status).toBe('failed');
          expect(number.orderId).toBe(user.lastOrderId);
        } else {
          expect(number.status).toBe('assigned');
        }
      }
      if (user.device) expect(findDevice(user.device.model)).toBeDefined();
      expect(user.email.endsWith('.example.com')).toBe(true);
    }
  });

  it('has unique emails and extensions per account and unique MACs overall', () => {
    const guards = data.users.flatMap(userGuardItems).map((g) => `${g.PK}|${g.SK}`);
    expect(new Set(guards).size).toBe(guards.length);
  });

  it('maintains account and site counters', () => {
    for (const account of data.accounts) {
      const users = data.users.filter((u) => u.accountId === account.id);
      const numbers = data.numbers.filter((n) => n.accountId === account.id);
      expect(account.userCount).toBe(users.length);
      expect(account.numbersTotal).toBe(numbers.length);
      expect(account.numbersAssigned).toBe(numbers.filter((n) => n.status !== 'available').length);
    }
    for (const site of data.sites) {
      expect(site.userCount).toBe(data.users.filter((u) => u.siteId === site.id).length);
      expect(site.numbersAvailable).toBe(
        data.numbers.filter((n) => n.siteId === site.id && n.status === 'available').length,
      );
      expect(site.numbersAvailable).toBeGreaterThan(0);
    }
  });

  it('has the sites and users the assistant examples refer to', () => {
    const lumen = data.sites.filter((s) => s.accountId === 'acc_lumen-ridge').map((s) => s.name);
    expect(lumen).toEqual(
      expect.arrayContaining(['Kanata Campus', 'Ottawa HQ', 'Gatineau Office']),
    );
    const kanata = data.sites.find((s) => s.name === 'Kanata Campus')!;
    expect(kanata.numbersAvailable).toBeGreaterThanOrEqual(20);
    expect(data.users.some((u) => u.siteId === kanata.id && u.extension === '2104')).toBe(true);
    const names = data.users.map((u) => `${u.firstName} ${u.lastName}`);
    expect(names).not.toContain('Priya Shah');
    expect(names).not.toContain('Tom Lee');
  });

  it('has an order history in every terminal state, all in the past', () => {
    expect(new Set(data.orders.map((o) => o.status))).toEqual(new Set(['active', 'failed']));
    for (const order of data.orders) {
      expect(Date.parse(order.completedAt!)).toBeLessThan(now.getTime());
      expect(order.counts.total).toBe(order.lines.length);
      const failed = order.lines.filter((l) => l.status === 'failed');
      expect(order.status).toBe(failed.length > 0 ? 'failed' : 'active');
      failed.forEach((l) => expect(l.error).toBeTruthy());
    }
  });

  it('turns everything into keyed items', () => {
    const items = seedItems(data);
    const keys = items.map((i) => `${i.PK}|${i.SK}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
