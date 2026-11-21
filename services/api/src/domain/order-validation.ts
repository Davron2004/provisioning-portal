import {
  MAX_ORDER_LINES,
  type Account,
  type DraftLine,
  type OrderDraft,
  type OrderPreview,
  type PhoneNumber,
  type ResolvedLine,
  type Site,
  type UserSnapshot,
  type ValidationIssue,
} from '@provisioning/contracts';
import { ValidationFailedError } from '../errors';
import type { UserRecord } from '../data/items';
import { findDevice } from './catalog';
import { toSnapshot } from './snapshots';

/**
 * Deterministic order rules. Preview, order creation and the workflow's
 * ValidateOrder step all run the same functions, so "what the person
 * approved" and "what the server accepts" cannot drift apart.
 *
 * Everything here is pure: the caller loads an AccountContext and gets back
 * issues. Concurrency (two orders racing for one number) is handled later by
 * conditional writes when the workflow claims resources.
 */
export interface AccountContext {
  account: Account;
  sites: Site[];
  users: UserRecord[];
  numbers: PhoneNumber[];
  /** Current owners of the MAC addresses the order mentions, across all accounts. */
  macOwners: ReadonlyMap<string, { accountId: string; userId: string }>;
}

export interface ValidateOptions {
  /** The order being re-validated; resources it already holds are not conflicts. */
  orderId?: string | undefined;
}

const issue = (
  lineIndex: number | null,
  field: string | null,
  code: string,
  message: string,
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue => ({ lineIndex, field, code, message, severity });

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const CHANGEABLE: ReadonlyArray<keyof UserSnapshot> = ['voicemail', 'deviceModel', 'macAddress'];

// ---------------------------------------------------------------------------
// Draft -> resolved lines (allocation)
// ---------------------------------------------------------------------------

/**
 * Fills in what the draft left out. Extensions: the lowest free one in the
 * site's range. DIDs: the lowest available number at the site. Values that
 * other lines request explicitly are never handed out to auto-allocated lines.
 *
 * Lines that cannot be resolved at all (unknown site or user, or a site with
 * no free extension) make the whole draft a 422: a preview must have one
 * resolved line per draft line.
 */
export function resolveDraft(
  draft: OrderDraft,
  ctx: AccountContext,
): { lines: ResolvedLine[]; issues: ValidationIssue[] } {
  const sites = new Map(ctx.sites.map((s) => [s.id, s]));
  const users = new Map(ctx.users.map((u) => [u.id, u]));
  const usedExtensions = new Set(ctx.users.map((u) => u.extension));
  const requestedExtensions = new Set<string>();
  const requestedDids = new Set<string>();
  for (const line of draft.lines) {
    if (line.action !== 'add_user') continue;
    if (line.extension) requestedExtensions.add(line.extension);
    if (line.did) requestedDids.add(line.did);
  }
  const takenDids = new Set<string>();
  const freeDids = (siteId: string) =>
    ctx.numbers
      .filter((n) => n.siteId === siteId && n.status === 'available')
      .map((n) => n.e164)
      .sort();

  const unresolved: ValidationIssue[] = [];
  const issues: ValidationIssue[] = [];
  const lines: ResolvedLine[] = [];

  draft.lines.forEach((line: DraftLine, index) => {
    if (line.action === 'add_user') {
      const site = sites.get(line.siteId);
      if (!site) {
        unresolved.push(
          issue(
            index,
            'siteId',
            'site_not_found',
            `Site ${line.siteId} does not belong to this account`,
          ),
        );
        return;
      }
      let extension = line.extension;
      if (!extension) {
        extension = lowestFreeExtension(
          site,
          (e) => usedExtensions.has(e) || requestedExtensions.has(e),
        );
        if (!extension) {
          unresolved.push(
            issue(
              index,
              'extension',
              'no_extensions_available',
              `${site.name} has no free extensions left`,
            ),
          );
          return;
        }
        usedExtensions.add(extension);
      }
      let did: string | null = line.did ?? null;
      if (!line.did) {
        did = freeDids(site.id).find((e) => !requestedDids.has(e) && !takenDids.has(e)) ?? null;
        if (did) takenDids.add(did);
        else
          issues.push(
            issue(
              index,
              'user.did',
              'no_numbers_available',
              `${site.name} has no available numbers left for this user`,
            ),
          );
      }
      lines.push({
        action: 'add_user',
        user: {
          firstName: line.firstName,
          lastName: line.lastName,
          email: line.email,
          siteId: site.id,
          extension,
          did,
          voicemail: line.voicemail,
          deviceModel: line.deviceModel,
          macAddress: line.deviceModel ? (line.macAddress ?? null) : null,
        },
      });
      return;
    }

    const user = users.get(line.userId);
    if (!user) {
      unresolved.push(
        issue(
          index,
          'userId',
          'user_not_found',
          `User ${line.userId} does not exist in this account`,
        ),
      );
      return;
    }
    const before = toSnapshot(user);
    if (line.action === 'remove_user') {
      lines.push({ action: 'remove_user', userId: user.id, before });
      return;
    }
    const { changes } = line;
    const deviceModel =
      changes.deviceModel === undefined ? before.deviceModel : changes.deviceModel;
    const deviceChanged = deviceModel !== before.deviceModel;
    const macAddress =
      deviceModel === null
        ? null
        : changes.macAddress !== undefined
          ? changes.macAddress
          : deviceChanged
            ? null
            : before.macAddress;
    lines.push({
      action: 'update_user',
      userId: user.id,
      before,
      after: {
        ...before,
        voicemail: changes.voicemail ?? before.voicemail,
        deviceModel,
        macAddress,
      },
    });
  });

  if (unresolved.length > 0) {
    throw new ValidationFailedError('Some lines refer to things that do not exist', {
      issues: unresolved,
    });
  }
  return { lines, issues };
}

function lowestFreeExtension(
  site: Site,
  taken: (extension: string) => boolean,
): string | undefined {
  const start = Number(site.extensionRange.start);
  const end = Number(site.extensionRange.end);
  const width = site.extensionRange.start.length;
  for (let n = start; n <= end; n++) {
    const extension = String(n).padStart(width, '0');
    if (!taken(extension)) return extension;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Rules on resolved lines
// ---------------------------------------------------------------------------

export function validateLines(
  lines: readonly ResolvedLine[],
  ctx: AccountContext,
  options: ValidateOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sites = new Map(ctx.sites.map((s) => [s.id, s]));
  const users = new Map(ctx.users.map((u) => [u.id, u]));
  const numbers = new Map(ctx.numbers.map((n) => [n.e164, n]));
  const byExtension = new Map(ctx.users.map((u) => [u.extension, u]));
  const byEmail = new Map(ctx.users.map((u) => [u.email.toLowerCase(), u]));
  const accountDomain = ctx.account.primaryContact.email.split('@')[1]?.toLowerCase();

  if (ctx.account.status === 'suspended') {
    issues.push(
      issue(
        null,
        null,
        'account_suspended',
        `${ctx.account.name} is suspended; orders are blocked until it is reactivated`,
      ),
    );
  }
  if (lines.length > MAX_ORDER_LINES) {
    issues.push(
      issue(null, 'lines', 'too_many_lines', `An order can have at most ${MAX_ORDER_LINES} lines`),
    );
  }

  // First line index that uses a value, to report duplicates inside the order.
  const seen = {
    extension: new Map<string, number>(),
    did: new Map<string, number>(),
    email: new Map<string, number>(),
    mac: new Map<string, number>(),
    user: new Map<string, number>(),
  };
  const duplicate = (kind: keyof typeof seen, value: string, index: number): number | undefined => {
    const first = seen[kind].get(value);
    if (first === undefined) seen[kind].set(value, index);
    return first;
  };

  const checkDevice = (
    index: number,
    prefix: string,
    snapshot: UserSnapshot,
    ownerId: string | null,
  ) => {
    if (snapshot.deviceModel === null) {
      if (snapshot.macAddress) {
        issues.push(
          issue(
            index,
            `${prefix}.macAddress`,
            'mac_without_device',
            'A MAC address needs a device model',
          ),
        );
      }
      return;
    }
    const device = findDevice(snapshot.deviceModel);
    if (!device) {
      issues.push(
        issue(
          index,
          `${prefix}.deviceModel`,
          'device_not_found',
          `Unknown device model "${snapshot.deviceModel}"`,
        ),
      );
      return;
    }
    if (!snapshot.macAddress) {
      if (device.requiresMac) {
        issues.push(
          issue(
            index,
            `${prefix}.macAddress`,
            'mac_missing',
            `${device.name} needs a MAC address before it can be configured; the user will be set up without device configuration`,
            'warning',
          ),
        );
      }
      return;
    }
    if (!device.requiresMac) {
      issues.push(
        issue(
          index,
          `${prefix}.macAddress`,
          'mac_not_applicable',
          `${device.name} does not take a MAC address`,
        ),
      );
      return;
    }
    const owner = ctx.macOwners.get(snapshot.macAddress);
    if (owner && owner.userId !== ownerId) {
      issues.push(
        issue(
          index,
          `${prefix}.macAddress`,
          'mac_in_use',
          `MAC ${snapshot.macAddress} is already registered to another phone`,
        ),
      );
    }
    const first = duplicate('mac', snapshot.macAddress, index);
    if (first !== undefined) {
      issues.push(
        issue(
          index,
          `${prefix}.macAddress`,
          'mac_duplicate',
          `MAC ${snapshot.macAddress} is also on line ${first + 1}`,
        ),
      );
    }
  };

  const checkExisting = (
    index: number,
    userId: string,
    before: UserSnapshot,
  ): UserRecord | undefined => {
    const user = users.get(userId);
    if (!user) {
      issues.push(
        issue(index, 'userId', 'user_not_found', `User ${userId} does not exist in this account`),
      );
      return undefined;
    }
    if (user.pendingOrderId && user.pendingOrderId !== options.orderId) {
      issues.push(
        issue(
          index,
          'userId',
          'user_busy',
          `${fullName(user)} is being changed by order ${user.pendingOrderId}`,
        ),
      );
    }
    const first = duplicate('user', userId, index);
    if (first !== undefined) {
      issues.push(
        issue(
          index,
          'userId',
          'duplicate_user',
          `${fullName(user)} is also changed by line ${first + 1}`,
        ),
      );
    }
    const current = toSnapshot(user);
    if (JSON.stringify(current) !== JSON.stringify(before)) {
      issues.push(
        issue(
          index,
          'before',
          'stale_preview',
          `${fullName(user)} changed since this order was previewed; preview it again`,
        ),
      );
    }
    return user;
  };

  lines.forEach((line, index) => {
    if (line.action === 'add_user') {
      const { user } = line;
      const site = sites.get(user.siteId);
      if (!site) {
        issues.push(
          issue(
            index,
            'user.siteId',
            'site_not_found',
            `Site ${user.siteId} does not belong to this account`,
          ),
        );
      } else {
        const ext = Number(user.extension);
        if (ext < Number(site.extensionRange.start) || ext > Number(site.extensionRange.end)) {
          issues.push(
            issue(
              index,
              'user.extension',
              'extension_out_of_range',
              `Extension ${user.extension} is outside ${site.name}'s range (${site.extensionRange.start}-${site.extensionRange.end})`,
            ),
          );
        }
      }
      const holder = byExtension.get(user.extension);
      if (holder) {
        issues.push(
          issue(
            index,
            'user.extension',
            'extension_in_use',
            `Extension ${user.extension} is already assigned to ${fullName(holder)}`,
          ),
        );
      }
      const extFirst = duplicate('extension', user.extension, index);
      if (extFirst !== undefined) {
        issues.push(
          issue(
            index,
            'user.extension',
            'extension_duplicate',
            `Extension ${user.extension} is also on line ${extFirst + 1}`,
          ),
        );
      }

      if (user.did) {
        const number = numbers.get(user.did);
        if (!number) {
          issues.push(
            issue(
              index,
              'user.did',
              'number_not_found',
              `${user.did} is not in this account's number inventory`,
            ),
          );
        } else {
          if (number.siteId !== user.siteId) {
            const where = sites.get(number.siteId)?.name ?? 'another site';
            issues.push(
              issue(index, 'user.did', 'number_wrong_site', `${user.did} belongs to ${where}`),
            );
          }
          const heldByThisOrder =
            options.orderId !== undefined && number.orderId === options.orderId;
          if (number.status !== 'available' && !heldByThisOrder) {
            issues.push(
              issue(
                index,
                'user.did',
                'number_unavailable',
                `${user.did} is already ${number.status}`,
              ),
            );
          }
        }
        const didFirst = duplicate('did', user.did, index);
        if (didFirst !== undefined) {
          issues.push(
            issue(
              index,
              'user.did',
              'number_duplicate',
              `${user.did} is also on line ${didFirst + 1}`,
            ),
          );
        }
      }

      const email = user.email.toLowerCase();
      const emailHolder = byEmail.get(email);
      if (emailHolder) {
        issues.push(
          issue(
            index,
            'user.email',
            'email_in_use',
            `${user.email} is already used by ${fullName(emailHolder)}`,
          ),
        );
      }
      const emailFirst = duplicate('email', email, index);
      if (emailFirst !== undefined) {
        issues.push(
          issue(
            index,
            'user.email',
            'email_duplicate',
            `${user.email} is also on line ${emailFirst + 1}`,
          ),
        );
      }
      if (accountDomain && email.split('@')[1] !== accountDomain) {
        issues.push(
          issue(
            index,
            'user.email',
            'email_domain',
            `${user.email} is not on the account's domain (${accountDomain})`,
            'warning',
          ),
        );
      }
      // On a retry the line already has its user, which may own the MAC itself.
      const ownerId = (line as { userId?: string | null }).userId ?? null;
      checkDevice(index, 'user', user, ownerId);
      return;
    }

    const existing = checkExisting(index, line.userId, line.before);
    if (line.action === 'update_user') {
      const changedFields = (Object.keys(line.after) as (keyof UserSnapshot)[]).filter(
        (k) => line.after[k] !== line.before[k],
      );
      if (changedFields.some((k) => !CHANGEABLE.includes(k))) {
        issues.push(
          issue(
            index,
            'after',
            'unsupported_change',
            'Only voicemail and the device can be changed on an existing user',
          ),
        );
      } else if (changedFields.length === 0) {
        issues.push(
          issue(index, 'after', 'no_changes', 'This line does not change anything', 'warning'),
        );
      }
      checkDevice(index, 'after', line.after, existing?.id ?? null);
    }
  });

  return issues.sort((a, b) => (a.lineIndex ?? -1) - (b.lineIndex ?? -1));
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function previewOrder(draft: OrderDraft, ctx: AccountContext): OrderPreview {
  const resolved = resolveDraft(draft, ctx);
  const issues = [...resolved.issues, ...validateLines(resolved.lines, ctx)].sort(
    (a, b) => (a.lineIndex ?? -1) - (b.lineIndex ?? -1),
  );
  return {
    accountId: ctx.account.id,
    lines: resolved.lines,
    issues,
    summary: {
      adds: resolved.lines.filter((l) => l.action === 'add_user').length,
      updates: resolved.lines.filter((l) => l.action === 'update_user').length,
      removes: resolved.lines.filter((l) => l.action === 'remove_user').length,
    },
    valid: !hasErrors(issues),
  };
}

/** MAC addresses a set of lines mentions, so the caller can load their current owners. */
export function macAddressesIn(lines: readonly (ResolvedLine | DraftLine)[]): string[] {
  const macs = new Set<string>();
  for (const line of lines) {
    if (line.action === 'add_user') {
      const mac = 'user' in line ? line.user.macAddress : line.macAddress;
      if (mac) macs.add(mac);
    } else if (line.action === 'update_user') {
      const mac = 'after' in line ? line.after.macAddress : line.changes.macAddress;
      if (mac) macs.add(mac);
    }
  }
  return [...macs];
}
