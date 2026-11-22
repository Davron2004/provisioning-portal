import {
  MAX_ORDER_LINES,
  type DraftLine,
  type IntentOperation,
  type OrderDraft,
  type OrderIntent,
  type Site,
  type TargetSelector,
} from '@provisioning/contracts';
import type { UserRecord } from '../data/items';
import { DEVICE_CATALOG } from '../domain/catalog';
import type { AccountContext } from '../domain/order-validation';
import { emailLocalPart } from '../domain/snapshots';

/**
 * Deterministic resolution of an OrderIntent against one account: free-text
 * sites, devices and people become ids, unnamed seats get placeholder names
 * and addresses on the account's domain, and every decision is explained in
 * a note. Nothing here guesses silently: an ambiguous or unknown reference is
 * skipped with a note, and the person reviews the preview before submitting.
 */
export interface Resolution {
  draft: OrderDraft | null;
  notes: string[];
}

/** The person's own words inside a note, in typographic quotes like the rest of the UI. */
const quote = (text: string) => `“${text}”`;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const NOISE = new Set(['the', 'site', 'office', 'location', 'our']);
const tokens = (s: string) =>
  fold(s)
    .split(' ')
    .filter((t) => t && !NOISE.has(t));

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/** A query token matches a name token exactly, as a prefix (3+ chars), or within a small typo distance. */
const tokenMatches = (query: string, name: string) =>
  query === name ||
  (query.length >= 3 && name.startsWith(query)) ||
  (query.length >= 5 && editDistance(query, name) <= (query.length >= 8 ? 2 : 1));

/**
 * "Kanata" -> Kanata Campus. Exact names win; otherwise every word of the
 * query must match a word of the site name. More than one candidate is
 * ambiguous and resolves to nothing.
 */
export function matchSite(
  query: string,
  sites: readonly Site[],
): { site: Site } | { error: string } {
  const exact = sites.find((s) => fold(s.name) === fold(query));
  if (exact) return { site: exact };
  const q = tokens(query);
  if (q.length === 0) return { error: `${quote(query)} does not name a site` };
  const candidates = sites.filter((s) => {
    const words = tokens(s.name);
    return q.every((t) => words.some((w) => tokenMatches(t, w)));
  });
  if (candidates.length === 1) return { site: candidates[0]! };
  if (candidates.length > 1) {
    return { error: `${quote(query)} could be ${candidates.map((s) => s.name).join(' or ')}` };
  }
  return {
    error: `No site matches ${quote(query)} (sites: ${sites.map((s) => s.name).join(', ')})`,
  };
}

/** Device text -> catalog id. `null` means "no device"; undefined means "not understood". */
export function matchDevice(text: string): string | null | undefined {
  const t = fold(text);
  if (/^(none|no( phone| device)?s?|remove( the)? (phone|device))$/.test(t)) return null;
  const byName = DEVICE_CATALOG.find(
    (d) => t.includes(fold(d.name)) || t.includes(d.id.split('-').pop()!),
  );
  if (byName) return byName.id;
  if (/\b(soft ?phones?|apps?|softphone)\b/.test(t)) return 'softphone';
  if (/\b(dect|cordless|handsets?)\b/.test(t)) return 'dect-h300';
  if (/\b(conference|boardroom|meeting room)\b/.test(t)) return 'conf-c100';
  if (/\b(colou?r|six line|premium)\b/.test(t)) return 'desk-d400';
  if (/\b(desk ?phones?|basic|phones?)\b/.test(t)) return 'desk-d200';
  return undefined;
}

const deviceName = (id: string | null) =>
  id === null ? 'no device' : (DEVICE_CATALOG.find((d) => d.id === id)?.name ?? id);
const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

export function resolveIntent(intent: OrderIntent, ctx: AccountContext): Resolution {
  const notes: string[] = [];
  const lines: DraftLine[] = [];
  const domain = ctx.account.primaryContact.email.split('@')[1]!.toLowerCase();
  const takenEmails = new Set(ctx.users.map((u) => u.email.toLowerCase()));

  for (const op of intent.operations) {
    if (op.op === 'add_users') lines.push(...resolveAdd(op, ctx, domain, takenEmails, notes));
    else lines.push(...resolveChange(op, ctx, notes));
  }
  // Text that was not understood is not repeated as a note: the response carries it in
  // `intent.unresolved`, and the app lists it once.

  if (lines.length > MAX_ORDER_LINES) {
    notes.push(
      `That would be ${lines.length} lines; an order can have at most ${MAX_ORDER_LINES}. Split the request.`,
    );
    return { draft: null, notes };
  }
  return { draft: lines.length > 0 ? { lines } : null, notes };
}

function resolveAdd(
  op: Extract<IntentOperation, { op: 'add_users' }>,
  ctx: AccountContext,
  domain: string,
  takenEmails: Set<string>,
  notes: string[],
): DraftLine[] {
  const match = matchSite(op.site, ctx.sites);
  if ('error' in match) {
    notes.push(`Skipped adding users: ${match.error}`);
    return [];
  }
  const { site } = match;
  if (fold(op.site) !== fold(site.name)) notes.push(`Matched ${quote(op.site)} to ${site.name}`);

  let deviceModel: string | null = null;
  if (op.device) {
    const device = matchDevice(op.device);
    if (device === undefined) {
      notes.push(`Did not recognise the device ${quote(op.device)}; the new users get no device`);
    } else {
      deviceModel = device;
      notes.push(`Matched ${quote(op.device)} to ${deviceName(device)}`);
    }
  }

  const base = {
    action: 'add_user' as const,
    siteId: site.id,
    voicemail: op.voicemail,
    deviceModel,
  };
  const lines: DraftLine[] = op.people.map((p) => {
    const email = p.email ?? `${emailLocalPart(p.firstName, p.lastName)}@${domain}`;
    takenEmails.add(email.toLowerCase());
    return { ...base, firstName: p.firstName.trim(), lastName: p.lastName.trim(), email };
  });
  const generated = op.people.filter((p) => !p.email).length;
  if (generated > 0) notes.push(`Email addresses for named people use ${domain}`);

  const unnamed = op.count - op.people.length;
  if (unnamed > 0) {
    const slug = emailLocalPart(site.name, '').replace(/\./g, '') || 'site';
    let n = 0;
    const width = String(unnamed).length < 2 ? 2 : String(unnamed).length;
    for (let i = 0; i < unnamed; i++) {
      let email: string;
      do {
        n += 1;
        email = `new.user.${slug}.${String(n).padStart(width, '0')}@${domain}`;
      } while (takenEmails.has(email));
      takenEmails.add(email);
      lines.push({
        ...base,
        firstName: 'New',
        lastName: `User ${String(n).padStart(width, '0')}`,
        email,
      });
    }
    notes.push(
      `${unnamed} unnamed seat${unnamed === 1 ? '' : 's'} at ${site.name} get placeholder names (“New User 01”) and addresses like new.user.${slug}.01@${domain}`,
    );
  }
  notes.push(
    `Extensions and numbers at ${site.name} are allocated in the preview${op.voicemail ? ', with voicemail' : ', without voicemail'}`,
  );
  return lines;
}

function resolveChange(
  op: Extract<IntentOperation, { op: 'update_users' | 'remove_users' }>,
  ctx: AccountContext,
  notes: string[],
): DraftLine[] {
  const verb = op.op === 'remove_users' ? 'remove' : 'change';
  const selected = selectUsers(op.target, ctx, notes);
  const free = selected.filter((u) => !u.pendingOrderId);
  if (free.length < selected.length) {
    notes.push(
      `Skipped ${selected.length - free.length} user(s) that another order is already changing`,
    );
  }

  if (op.op === 'remove_users') {
    if (free.length > 0) notes.push(`Will remove ${describe(free)}`);
    return free.map((u) => ({ action: 'remove_user' as const, userId: u.id }));
  }

  let deviceModel: string | null | undefined;
  if (op.set.device !== null) {
    deviceModel = matchDevice(op.set.device);
    if (deviceModel === undefined) {
      notes.push(
        `Did not recognise the device ${quote(op.set.device)}; devices are left as they are`,
      );
    } else {
      notes.push(`Matched ${quote(op.set.device)} to ${deviceName(deviceModel)}`);
    }
  }
  const lines: DraftLine[] = [];
  let unchanged = 0;
  for (const user of free) {
    const changes: { voicemail?: boolean; deviceModel?: string | null } = {};
    if (op.set.voicemail !== null && op.set.voicemail !== user.voicemail)
      changes.voicemail = op.set.voicemail;
    if (deviceModel !== undefined && deviceModel !== (user.device?.model ?? null)) {
      changes.deviceModel = deviceModel;
    }
    if (Object.keys(changes).length === 0) {
      unchanged += 1;
      continue;
    }
    lines.push({ action: 'update_user', userId: user.id, changes });
  }
  if (unchanged > 0) notes.push(`${unchanged} user(s) already had that setting and are left out`);
  if (lines.length > 0) notes.push(`Will ${verb} ${lines.length} user(s)`);
  return lines;
}

function selectUsers(target: TargetSelector, ctx: AccountContext, notes: string[]): UserRecord[] {
  let pool = ctx.users;
  if (target.site) {
    const match = matchSite(target.site, ctx.sites);
    if ('error' in match) {
      notes.push(`Skipped: ${match.error}`);
      return [];
    }
    if (fold(target.site) !== fold(match.site.name)) {
      notes.push(`Matched ${quote(target.site)} to ${match.site.name}`);
    }
    pool = pool.filter((u) => u.siteId === match.site.id);
  }

  const selected = new Map<string, UserRecord>();
  if (target.all) {
    if (!target.site) {
      notes.push('Skipped a change aimed at everyone without naming a site');
      return [];
    }
    for (const u of pool) selected.set(u.id, u);
  }
  for (const ext of target.extensions) {
    const user = pool.find((u) => u.extension === ext);
    if (user) {
      selected.set(user.id, user);
      notes.push(`Extension ${ext} is ${fullName(user)}`);
    } else {
      notes.push(`No user has extension ${ext}${target.site ? ' at that site' : ''}`);
    }
  }
  for (const name of target.names) {
    const q = tokens(name);
    const matches = pool.filter((u) => {
      const words = tokens(fullName(u));
      return (
        q.length > 0 &&
        q.every((t) => words.some((w) => w === t || (t.length >= 3 && w.startsWith(t))))
      );
    });
    if (matches.length === 1) {
      selected.set(matches[0]!.id, matches[0]!);
      if (fold(name) !== fold(fullName(matches[0]!))) {
        notes.push(
          `Matched ${quote(name)} to ${fullName(matches[0]!)} (ext ${matches[0]!.extension})`,
        );
      }
    } else if (matches.length > 1) {
      notes.push(
        `${quote(name)} could be ${matches.map((u) => `${fullName(u)} (ext ${u.extension})`).join(' or ')}; use the extension`,
      );
    } else {
      notes.push(`No user matches ${quote(name)}`);
    }
  }
  return [...selected.values()];
}

function describe(users: readonly UserRecord[]): string {
  if (users.length <= 3) return users.map((u) => `${fullName(u)} (ext ${u.extension})`).join(', ');
  return `${users.length} users`;
}
