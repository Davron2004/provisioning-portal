import { ulid } from 'ulid';
import type {
  Account,
  OrderEvent,
  OrderLine,
  OrderSource,
  PhoneNumber,
  ResolvedLine,
  Site,
  UserDevice,
} from '@provisioning/contracts';
import { findDevice } from '../../domain/catalog';
import { countLines } from '../../domain/order-counts';
import { orderEvent, orderMessages } from '../../domain/order-events';
import { orderTitle } from '../../domain/order-title';
import { emailLocalPart, lineIdFor, lineLabel, toSnapshot } from '../../domain/snapshots';
import type { OrderRecord, UserRecord } from '../../data/items';
import { pick, randomInt, seededRandom, shuffle } from '../../lib/random';
import {
  ACCOUNT_FIXTURES,
  FIRST_NAMES,
  LAST_NAMES,
  type AccountFixture,
  type SiteFixture,
} from './fixtures';

/**
 * Builds the demo dataset: accounts, sites, users, number inventory and an
 * order history in every terminal state. Deterministic for a given seed;
 * timestamps are relative to `now` so the history always looks recent.
 */
export interface SeedData {
  accounts: Account[];
  sites: Site[];
  users: UserRecord[];
  numbers: PhoneNumber[];
  orders: OrderRecord[];
}

/** Portal operators (the provider's staff) who submitted the historical orders. */
export const SEED_STAFF = ['admin@example.com', 'ops@example.com'] as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface SiteState {
  fixture: SiteFixture;
  site: Site;
  /** Free numbers in the order they will be handed out (shuffled, so assignments look organic). */
  free: string[];
  nextExtension: number;
  issued: number;
}

interface AccountState {
  fixture: AccountFixture;
  createdAt: number;
  sites: SiteState[];
  users: UserRecord[];
  usedNames: Set<string>;
  orders: OrderRecord[];
}

interface HistoricLine {
  line: ResolvedLine;
  outcome: 'succeeded' | 'failed';
  userId: string | null;
  /** A transient error that was retried before the outcome. */
  retried?: string;
  error?: string;
}

export function generateSeed(now: Date = new Date(), seed = 20_261_121): SeedData {
  const random = seededRandom(seed);
  const nowMs = now.getTime();
  const usedMacs = new Set<string>();
  const numbers = new Map<string, PhoneNumber>();
  const newId = (prefix: string, at: number) => `${prefix}_${ulid(at, random)}`;
  const iso = (ms: number) => new Date(ms).toISOString();

  // --- helpers that touch shared state ------------------------------------

  const macAddress = (): string => {
    for (;;) {
      // 02: is a locally administered prefix, so no vendor is implied.
      const bytes = Array.from({ length: 5 }, () =>
        randomInt(random, 0, 255).toString(16).padStart(2, '0').toUpperCase(),
      );
      const mac = ['02', ...bytes].join(':');
      if (!usedMacs.has(mac)) {
        usedMacs.add(mac);
        return mac;
      }
    }
  };

  const randomDevice = (): UserDevice | null => {
    const roll = random();
    const model =
      roll < 0.36
        ? 'desk-d200'
        : roll < 0.6
          ? 'desk-d400'
          : roll < 0.86
            ? 'softphone'
            : roll < 0.94
              ? 'dect-h300'
              : null;
    if (!model) return null;
    const needsMac = findDevice(model)?.requiresMac ?? false;
    // A few hardware phones are still waiting for their MAC from the customer.
    return { model, macAddress: needsMac && random() < 0.88 ? macAddress() : null };
  };

  const newPerson = (state: AccountState): { firstName: string; lastName: string } => {
    for (;;) {
      const firstName = pick(random, FIRST_NAMES);
      const lastName = pick(random, LAST_NAMES);
      const key = emailLocalPart(firstName, lastName);
      if (!state.usedNames.has(key)) {
        state.usedNames.add(key);
        return { firstName, lastName };
      }
    }
  };

  const nextExtension = (site: SiteState): string => {
    // The first ten extensions are contiguous (the assistant examples rely
    // on 2104 at Kanata Campus); later ones have the odd gap left by leavers.
    if (site.issued >= 10 && random() < 0.12) site.nextExtension += 1;
    const extension = site.nextExtension;
    if (extension > site.fixture.extensionRange.end)
      throw new Error(`${site.site.name} ran out of extensions`);
    site.nextExtension += 1;
    site.issued += 1;
    return String(extension);
  };

  const takeNumber = (site: SiteState): string => {
    const e164 = site.free.shift();
    if (!e164) throw new Error(`${site.site.name} ran out of numbers`);
    return e164;
  };

  const assignNumber = (
    e164: string,
    userId: string,
    at: number,
    orderId: string | null = null,
  ) => {
    const number = numbers.get(e164)!;
    Object.assign(number, {
      status: orderId ? 'reserved' : 'assigned',
      userId,
      orderId,
      updatedAt: iso(at),
    });
  };

  const makeUser = (
    state: AccountState,
    site: SiteState,
    at: number,
    overrides: Partial<
      Pick<UserRecord, 'firstName' | 'lastName' | 'voicemail' | 'device' | 'status' | 'did'>
    > = {},
  ): UserRecord => {
    const person = overrides.firstName
      ? { firstName: overrides.firstName, lastName: overrides.lastName! }
      : newPerson(state);
    const id = newId('usr', at);
    const did = overrides.did === undefined ? takeNumber(site) : overrides.did;
    const user: UserRecord = {
      id,
      accountId: state.fixture.id,
      siteId: site.site.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: `${emailLocalPart(person.firstName, person.lastName)}@${state.fixture.domain}`,
      extension: nextExtension(site),
      did,
      voicemail: overrides.voicemail ?? random() < 0.8,
      device: overrides.device === undefined ? randomDevice() : overrides.device,
      status: overrides.status ?? 'active',
      lastOrderId: null,
      createdAt: iso(at),
      updatedAt: iso(at),
      pendingOrderId: null,
    };
    if (did) assignNumber(did, id, at);
    state.users.push(user);
    return user;
  };

  const buildOrder = (
    state: AccountState,
    params: {
      at: number;
      submittedBy: string;
      source?: OrderSource;
      prompt?: string;
      lines: HistoricLine[];
    },
  ): { order: OrderRecord; finishedAt: number[] } => {
    const { at, lines } = params;
    const orderId = newId('ord', at);
    const events: OrderEvent[] = [
      orderEvent(iso(at), orderMessages.submitted(params.submittedBy), { status: 'submitted' }),
      orderEvent(iso(at + 1_100), orderMessages.validating(lines.length), { status: 'validating' }),
      orderEvent(iso(at + 2_300), orderMessages.provisioning(lines.length), {
        status: 'provisioning',
      }),
    ];
    const finishedAt: number[] = [];
    const orderLines: OrderLine[] = lines.map((historic, index) => {
      const label = lineLabel(index, historic.line);
      const lineId = lineIdFor(index);
      let t = at + 2_300 + Math.floor(index / 5) * 9_000 + randomInt(random, 4_000, 9_000);
      let attempts = 1;
      if (historic.retried) {
        events.push(
          orderEvent(iso(t), orderMessages.lineRetrying(label, historic.retried), { lineId }),
        );
        t += randomInt(random, 6_000, 10_000);
        attempts = 2;
      }
      if (historic.outcome === 'failed') {
        attempts = 3;
        t += 14_000;
        events.push(
          orderEvent(iso(t), orderMessages.lineFailed(label, historic.error!), { lineId }),
        );
      } else {
        events.push(orderEvent(iso(t), orderMessages.lineSucceeded(label), { lineId }));
      }
      finishedAt.push(t);
      return {
        ...historic.line,
        lineId,
        status: historic.outcome,
        attempts,
        step: null,
        error: historic.outcome === 'failed' ? historic.error! : null,
        userId: historic.userId,
        updatedAt: iso(t),
      } as OrderLine;
    });

    const done = Math.max(...finishedAt) + 600;
    const failed = orderLines.filter((l) => l.status === 'failed').length;
    const status = failed > 0 ? 'failed' : 'active';
    events.push(
      orderEvent(
        iso(done),
        failed > 0
          ? orderMessages.failed(failed, lines.length)
          : orderMessages.completed(lines.length),
        { status },
      ),
    );
    events.sort((a, b) => a.at.localeCompare(b.at));

    const siteNames = new Map(state.sites.map((s) => [s.site.id, s.site.name]));
    const order: OrderRecord = {
      id: orderId,
      accountId: state.fixture.id,
      accountName: state.fixture.name,
      status,
      source: params.source ?? 'manual',
      title: orderTitle(orderLines, siteNames),
      counts: countLines(orderLines),
      submittedBy: params.submittedBy,
      createdAt: iso(at),
      updatedAt: iso(done),
      completedAt: iso(done),
      prompt: params.prompt ?? null,
      lines: orderLines,
      events,
      version: 1,
    };
    state.orders.push(order);
    return { order, finishedAt };
  };

  /** Adds `count` users through a historical order. */
  const addUsersOrder = (
    state: AccountState,
    site: SiteState,
    count: number,
    at: number,
    options: {
      submittedBy: string;
      source?: OrderSource;
      prompt?: string;
      voicemail?: boolean;
      device?: () => UserDevice | null;
      failLast?: string;
      retrySecond?: string;
    },
  ) => {
    const users = Array.from({ length: count }, () =>
      makeUser(state, site, at, {
        ...(options.voicemail === undefined ? {} : { voicemail: options.voicemail }),
        ...(options.device ? { device: options.device() } : {}),
      }),
    );
    const lines: HistoricLine[] = users.map((user, index) => {
      const failed = options.failLast !== undefined && index === users.length - 1;
      return {
        line: { action: 'add_user', user: toSnapshot(user) },
        outcome: failed ? 'failed' : 'succeeded',
        userId: user.id,
        ...(failed ? { error: options.failLast } : {}),
        ...(index === 1 && options.retrySecond ? { retried: options.retrySecond } : {}),
      };
    });
    const { order, finishedAt } = buildOrder(state, { at, lines, ...options });
    users.forEach((user, index) => {
      const failed = order.lines[index]!.status === 'failed';
      user.lastOrderId = order.id;
      user.createdAt = iso(at);
      user.updatedAt = iso(finishedAt[index]!);
      if (failed) {
        // A failed add keeps its claimed resources until the line is retried.
        user.status = 'failed';
        if (user.did) assignNumber(user.did, user.id, finishedAt[index]!, order.id);
      }
    });
  };

  /** Changes voicemail on one user and the device on another through a historical order. */
  const updateUsersOrder = (
    state: AccountState,
    candidates: UserRecord[],
    at: number,
    submittedBy: string,
    failLast?: string,
  ) => {
    const targets = candidates.slice(0, failLast ? 3 : 2);
    const lines: HistoricLine[] = targets.map((user, index) => {
      const before = toSnapshot(user);
      const after =
        index % 2 === 0
          ? { ...before, voicemail: !before.voicemail }
          : {
              ...before,
              deviceModel: before.deviceModel === 'desk-d400' ? 'softphone' : 'desk-d400',
              macAddress: before.deviceModel === 'desk-d400' ? null : macAddress(),
            };
      const failed = failLast !== undefined && index === targets.length - 1;
      return {
        line: { action: 'update_user', userId: user.id, before, after },
        outcome: failed ? 'failed' : 'succeeded',
        userId: user.id,
        ...(failed ? { error: failLast } : {}),
      };
    });
    const { order, finishedAt } = buildOrder(state, { at, lines, submittedBy });
    targets.forEach((user, index) => {
      const line = order.lines[index]!;
      user.lastOrderId = order.id;
      user.updatedAt = iso(finishedAt[index]!);
      if (line.status === 'failed') {
        user.status = 'failed';
      } else if (line.action === 'update_user') {
        user.voicemail = line.after.voicemail;
        user.device = line.after.deviceModel
          ? { model: line.after.deviceModel, macAddress: line.after.macAddress }
          : null;
      }
    });
  };

  /** Removes a (fictional) leaver; their number goes back to the pool. */
  const removeLeaverOrder = (
    state: AccountState,
    site: SiteState,
    at: number,
    submittedBy: string,
  ) => {
    const leaverAt = state.createdAt + 20 * DAY;
    const leaver = makeUser(state, site, leaverAt);
    state.users.pop();
    const { finishedAt } = buildOrder(state, {
      at,
      submittedBy,
      lines: [
        {
          line: { action: 'remove_user', userId: leaver.id, before: toSnapshot(leaver) },
          outcome: 'succeeded',
          userId: leaver.id,
        },
      ],
    });
    if (leaver.did) {
      Object.assign(numbers.get(leaver.did)!, {
        status: 'available',
        userId: null,
        orderId: null,
        updatedAt: iso(finishedAt[0]!),
      });
      site.free.push(leaver.did);
    }
  };

  // --- build every account --------------------------------------------------

  const states: AccountState[] = ACCOUNT_FIXTURES.map((fixture) => {
    const createdAt = nowMs - fixture.createdDaysAgo * DAY + 14 * HOUR;
    const sites = fixture.sites.map((siteFixture, index): SiteState => {
      const siteCreatedAt = createdAt + (index + 1) * 2 * DAY;
      const e164s = siteFixture.numbers.flatMap((block) =>
        Array.from(
          { length: block.to - block.from + 1 },
          (_, i) => `+1${block.npa}5550${String(block.from + i).padStart(3, '0')}`,
        ),
      );
      for (const e164 of e164s) {
        numbers.set(e164, {
          e164,
          accountId: fixture.id,
          siteId: siteFixture.id,
          status: 'available',
          userId: null,
          orderId: null,
          updatedAt: new Date(siteCreatedAt).toISOString(),
        });
      }
      return {
        fixture: siteFixture,
        site: {
          id: siteFixture.id,
          accountId: fixture.id,
          name: siteFixture.name,
          address: siteFixture.address,
          timezone: siteFixture.timezone,
          extensionRange: {
            start: String(siteFixture.extensionRange.start),
            end: String(siteFixture.extensionRange.end),
          },
          userCount: 0,
          numbersAvailable: 0,
          createdAt: new Date(siteCreatedAt).toISOString(),
        },
        free: shuffle(random, e164s),
        nextExtension: siteFixture.extensionRange.start,
        issued: 0,
      };
    });
    return { fixture, createdAt, sites, users: [], usedNames: new Set(), orders: [] };
  });

  /** A time `days` ago at roughly `localHour` in Ottawa (UTC-5 in winter). */
  const ago = (days: number, localHour: number) =>
    nowMs - days * DAY - (nowMs % DAY) + (localHour + 5) * HOUR + randomInt(random, 0, 50) * 60_000;
  const [lumen, carling, merBleue, bytown, hogsback] = states as [
    AccountState,
    AccountState,
    AccountState,
    AccountState,
    AccountState,
  ];
  const siteOf = (state: AccountState, id: string) => state.sites.find((s) => s.site.id === id)!;
  /** Users added by historical orders, so the baseline leaves room for them. */
  const viaOrders: Record<string, number> = {
    'site_lr-kanata': 5,
    'site_lr-toronto': 0,
    'site_cp-gatineau': 3,
    'site_mb-barrhaven': 4,
    'site_bq-montreal': 4,
    'site_hb-byward': 3,
  };

  // Baseline users, created between the site opening and three weeks ago.
  for (const state of states) {
    for (const site of state.sites) {
      const baseline = site.fixture.users - (viaOrders[site.site.id] ?? 0);
      const from = Date.parse(site.site.createdAt) + DAY;
      const to = Math.max(from + DAY, nowMs - 21 * DAY);
      const times = Array.from({ length: baseline }, () => randomInt(random, from, to)).sort(
        (a, b) => a - b,
      );
      times.forEach((at, index) => {
        // Bigger sites have a shared boardroom phone with no DID.
        if (index === 0 && site.fixture.users >= 20) {
          makeUser(state, site, at, {
            firstName: 'Boardroom',
            lastName: site.fixture.shortName,
            voicemail: false,
            did: null,
            device: { model: 'conf-c100', macAddress: macAddress() },
          });
        } else {
          makeUser(state, site, at);
        }
      });
    }
  }

  const deskPhone = () => ({ model: 'desk-d200', macAddress: macAddress() });
  const people = (state: AccountState) => state.users.filter((u) => u.firstName !== 'Boardroom');

  // Lumen Ridge: a big add at Kanata (one transient retry), routine changes, a leaver,
  // and a recent failed order at Toronto Lab whose failed line can be retried.
  addUsersOrder(lumen, siteOf(lumen, 'site_lr-kanata'), 5, ago(16, 14), {
    submittedBy: SEED_STAFF[0],
    retrySecond: 'Carrier API timed out',
  });
  updateUsersOrder(lumen, shuffle(random, people(lumen)), ago(9, 16), SEED_STAFF[1]);
  removeLeaverOrder(lumen, siteOf(lumen, 'site_lr-ottawa-hq'), ago(5, 13), SEED_STAFF[0]);
  addUsersOrder(lumen, siteOf(lumen, 'site_lr-toronto'), 3, ago(2, 17), {
    submittedBy: SEED_STAFF[0],
    failLast: 'Carrier did not confirm number activation within 120 s (gave up after 3 attempts)',
  });

  // Carling Pine: an add at Gatineau, a leaver, and a failed device change.
  addUsersOrder(carling, siteOf(carling, 'site_cp-gatineau'), 3, ago(14, 10), {
    submittedBy: SEED_STAFF[1],
  });
  removeLeaverOrder(carling, siteOf(carling, 'site_cp-ottawa'), ago(7, 11), SEED_STAFF[1]);
  const mississauga = people(carling).filter((u) => u.siteId === 'site_cp-mississauga');
  updateUsersOrder(
    carling,
    mississauga,
    ago(1, 9),
    SEED_STAFF[0],
    'Phone did not fetch its configuration (no response after 3 attempts)',
  );

  // Mer Bleue: an order that came from the assistant, then routine changes.
  addUsersOrder(merBleue, siteOf(merBleue, 'site_mb-barrhaven'), 4, ago(12, 15), {
    submittedBy: SEED_STAFF[0],
    source: 'assistant',
    prompt: 'add 4 users at Barrhaven with voicemail and desk phones',
    voicemail: true,
    device: deskPhone,
  });
  updateUsersOrder(merBleue, shuffle(random, people(merBleue)), ago(6, 10), SEED_STAFF[1]);
  removeLeaverOrder(merBleue, siteOf(merBleue, 'site_mb-orleans'), ago(3, 14), SEED_STAFF[1]);

  // Bytown Quill is onboarding: its Montréal office was set up this week.
  addUsersOrder(bytown, siteOf(bytown, 'site_bq-montreal'), 4, ago(3, 11), {
    submittedBy: SEED_STAFF[1],
  });

  // Hogsback was suspended after its last change.
  addUsersOrder(hogsback, siteOf(hogsback, 'site_hb-byward'), 3, ago(40, 12), {
    submittedBy: SEED_STAFF[0],
  });

  // --- counters ---------------------------------------------------------------

  const allNumbers = [...numbers.values()];
  const accounts: Account[] = states.map((state) => {
    const accountNumbers = allNumbers.filter((n) => n.accountId === state.fixture.id);
    for (const site of state.sites) {
      site.site.userCount = state.users.filter((u) => u.siteId === site.site.id).length;
      site.site.numbersAvailable = accountNumbers.filter(
        (n) => n.siteId === site.site.id && n.status === 'available',
      ).length;
    }
    const lastChange = Math.max(
      state.createdAt,
      ...state.orders.map((o) => Date.parse(o.updatedAt)),
    );
    const { firstName, lastName } = state.fixture.contact;
    return {
      id: state.fixture.id,
      name: state.fixture.name,
      plan: state.fixture.plan,
      status: state.fixture.status,
      primaryContact: {
        name: `${firstName} ${lastName}`,
        email: `${emailLocalPart(firstName, lastName)}@${state.fixture.domain}`,
      },
      siteCount: state.sites.length,
      userCount: state.users.length,
      numbersAssigned: accountNumbers.filter((n) => n.status !== 'available').length,
      numbersTotal: accountNumbers.length,
      createdAt: iso(state.createdAt),
      updatedAt: iso(lastChange),
    };
  });

  return {
    accounts,
    sites: states.flatMap((s) => s.sites.map((site) => site.site)),
    users: states.flatMap((s) => s.users),
    numbers: allNumbers,
    orders: states.flatMap((s) => s.orders),
  };
}
