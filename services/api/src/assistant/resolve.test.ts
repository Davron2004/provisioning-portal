import { describe, expect, it } from 'vitest';
import type { OrderIntent } from '@provisioning/contracts';
import { site, testContext, user } from '../test-support/fixtures';
import { matchDevice, matchSite, resolveIntent } from './resolve';

const sites = [
  site('site_k', 'Kanata Campus', '2100', '2199'),
  site('site_o', 'Ottawa HQ', '2000', '2099'),
  site('site_g', 'Gatineau Office', '2300', '2399'),
  site('site_t', 'Toronto Lab', '2400', '2499'),
];
const ctx = testContext({ sites });
const intent = (operations: OrderIntent['operations'], unresolved: string[] = []): OrderIntent => ({
  operations,
  unresolved,
});
const target = { site: null, extensions: [], names: [], all: false };

describe('matchSite', () => {
  it.each([
    ['Kanata', 'Kanata Campus'],
    ['the kanata site', 'Kanata Campus'],
    ['Kanatta', 'Kanata Campus'],
    ['ottawa', 'Ottawa HQ'],
    ['GATINEAU OFFICE', 'Gatineau Office'],
  ])('matches "%s" to %s', (query, name) => {
    expect(matchSite(query, sites)).toEqual({ site: expect.objectContaining({ name }) });
  });

  it('refuses unknown and ambiguous names', () => {
    expect(matchSite('Montreal', sites)).toEqual({
      error: expect.stringContaining('No site matches'),
    });
    const twoOttawas = [...sites, site('site_o2', 'Ottawa Annex', '2500', '2599')];
    expect(matchSite('Ottawa', twoOttawas)).toEqual({
      error: '“Ottawa” could be Ottawa HQ or Ottawa Annex',
    });
  });
});

describe('matchDevice', () => {
  it.each([
    ['desk phones', 'desk-d200'],
    ['basic phone', 'desk-d200'],
    ['color desk phone', 'desk-d400'],
    ['D400s', 'desk-d400'],
    ['softphones', 'softphone'],
    ['the app', 'softphone'],
    ['cordless handsets', 'dect-h300'],
    ['conference phone', 'conf-c100'],
    ['none', null],
    ['no phone', null],
    ['fax machine', undefined],
  ])('maps "%s" to %s', (text, id) => {
    expect(matchDevice(text)).toBe(id);
  });
});

describe('resolveIntent', () => {
  it('adds named people and placeholder seats on the account domain', () => {
    const { draft, notes } = resolveIntent(
      intent([
        {
          op: 'add_users',
          site: 'Kanata',
          count: 3,
          people: [{ firstName: 'Priya', lastName: 'Shah', email: null }],
          voicemail: true,
          device: 'desk phones',
        },
      ]),
      ctx,
    );
    expect(draft?.lines).toEqual([
      expect.objectContaining({
        firstName: 'Priya',
        lastName: 'Shah',
        email: 'priya.shah@test.example.com',
        siteId: 'site_k',
        deviceModel: 'desk-d200',
        voicemail: true,
      }),
      expect.objectContaining({
        firstName: 'New',
        lastName: 'User 01',
        email: 'new.user.kanatacampus.01@test.example.com',
      }),
      expect.objectContaining({
        firstName: 'New',
        lastName: 'User 02',
        email: 'new.user.kanatacampus.02@test.example.com',
      }),
    ]);
    expect(notes).toEqual(
      expect.arrayContaining([
        'Matched “Kanata” to Kanata Campus',
        'Matched “desk phones” to D200 desk phone',
      ]),
    );
  });

  it('skips placeholder addresses that are already taken', () => {
    const taken = testContext({
      sites,
      users: [
        user({
          id: 'p1',
          email: 'new.user.kanatacampus.01@test.example.com',
          firstName: 'New',
          lastName: 'User 01',
        }),
      ],
    });
    const { draft } = resolveIntent(
      intent([
        { op: 'add_users', site: 'Kanata', count: 1, people: [], voicemail: false, device: null },
      ]),
      taken,
    );
    expect(draft?.lines[0]).toMatchObject({
      lastName: 'User 02',
      email: 'new.user.kanatacampus.02@test.example.com',
    });
  });

  it('selects users by extension and name, and explains what it could not find', () => {
    const { draft, notes } = resolveIntent(
      intent([
        { op: 'remove_users', target: { ...target, extensions: ['2100', '2999'] } },
        { op: 'remove_users', target: { ...target, names: ['omar', 'Nobody Here'] } },
      ]),
      ctx,
    );
    expect(draft?.lines).toEqual([
      { action: 'remove_user', userId: 'u1' },
      { action: 'remove_user', userId: 'u2' },
    ]);
    expect(notes).toEqual(
      expect.arrayContaining([
        'Extension 2100 is Sofia Beaulieu',
        'No user has extension 2999',
        'Matched “omar” to Omar Haddad (ext 2102)',
        'No user matches “Nobody Here”',
      ]),
    );
  });

  it('applies a change to everyone at a site, leaving out the unchanged and the busy', () => {
    const busy = testContext({
      sites,
      users: [
        user({ id: 'a', extension: '2100', voicemail: true }),
        user({ id: 'b', extension: '2101', voicemail: false }),
        user({ id: 'c', extension: '2102', voicemail: true, pendingOrderId: 'ord_x' }),
        user({ id: 'd', siteId: 'site_o', extension: '2000', voicemail: true }),
      ],
    });
    const { draft, notes } = resolveIntent(
      intent([
        {
          op: 'update_users',
          target: { ...target, site: 'Kanata', all: true },
          set: { voicemail: false, device: null },
        },
      ]),
      busy,
    );
    expect(draft?.lines).toEqual([
      { action: 'update_user', userId: 'a', changes: { voicemail: false } },
    ]);
    expect(notes).toEqual(
      expect.arrayContaining([
        'Skipped 1 user(s) that another order is already changing',
        '1 user(s) already had that setting and are left out',
      ]),
    );
  });

  it('does not act on ambiguous names, site-less "everyone", or too many lines', () => {
    const twins = testContext({
      sites,
      users: [
        user({ id: 'a', firstName: 'Sofia', lastName: 'Beaulieu' }),
        user({ id: 'b', firstName: 'Sofia', lastName: 'Eriksen', extension: '2101' }),
      ],
    });
    const ambiguous = resolveIntent(
      intent([{ op: 'remove_users', target: { ...target, names: ['Sofia'] } }]),
      twins,
    );
    expect(ambiguous.draft).toBeNull();
    expect(ambiguous.notes[0]).toContain(
      'could be Sofia Beaulieu (ext 2100) or Sofia Eriksen (ext 2101)',
    );

    const everyone = resolveIntent(
      intent([{ op: 'remove_users', target: { ...target, all: true } }]),
      ctx,
    );
    expect(everyone.draft).toBeNull();

    const many = resolveIntent(
      intent([
        { op: 'add_users', site: 'Kanata', count: 60, people: [], voicemail: true, device: null },
        { op: 'add_users', site: 'Ottawa', count: 60, people: [], voicemail: true, device: null },
      ]),
      ctx,
    );
    expect(many.draft).toBeNull();
    expect(many.notes.at(-1)).toBe(
      'That would be 120 lines; an order can have at most 100. Split the request.',
    );
  });

  it('leaves unresolved text to the intent instead of repeating it as a note', () => {
    expect(resolveIntent(intent([], ['order pizza']), ctx)).toEqual({ draft: null, notes: [] });
  });
});
