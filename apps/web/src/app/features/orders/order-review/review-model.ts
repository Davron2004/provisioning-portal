import {
  DeviceModel,
  DraftLine,
  OrderDraft,
  OrderPreview,
  ResolvedLine,
  Site,
  UserSnapshot,
  ValidationIssue,
} from '@provisioning/contracts';
import { formatPhoneNumber } from '../../../shared/pipes/phone-number.pipe';

/**
 * The view model of a preview: one row per order line, each field as a before/after
 * pair, so the template only decides how to draw a diff, not what changed.
 */

export type LineAction = ResolvedLine['action'];

export const REVIEW_FIELDS = ['site', 'extension', 'did', 'voicemail', 'device'] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const REVIEW_FIELD_LABELS: Readonly<Record<ReviewField, string>> = {
  site: 'Site',
  extension: 'Extension',
  did: 'Number',
  voicemail: 'Voicemail',
  device: 'Device',
};

/** One field of one line. `before` is null for adds, `after` is null for removals. */
export interface ReviewCell {
  readonly before: string | null;
  readonly after: string | null;
  /** A second line under the value, e.g. the device's MAC address. */
  readonly beforeDetail: string | null;
  readonly afterDetail: string | null;
  readonly changed: boolean;
  /** The server chose this value (an extension or number nobody asked for). */
  readonly auto: boolean;
}

export interface ReviewRow {
  /** Position in the order, from 0. */
  readonly index: number;
  readonly action: LineAction;
  readonly name: string;
  readonly email: string;
  readonly cells: Readonly<Record<ReviewField, ReviewCell>>;
  readonly issues: readonly ValidationIssue[];
  /** The worst issue on the line. */
  readonly severity: ValidationIssue['severity'] | null;
}

export interface ReviewContext {
  readonly sites: readonly Site[];
  readonly devices: readonly DeviceModel[];
}

interface FieldValue {
  readonly text: string;
  readonly detail: string | null;
}

function fieldValue(field: ReviewField, user: UserSnapshot, context: ReviewContext): FieldValue {
  switch (field) {
    case 'site':
      return {
        text: context.sites.find((site) => site.id === user.siteId)?.name ?? user.siteId,
        detail: null,
      };
    case 'extension':
      return { text: user.extension, detail: null };
    case 'did':
      return { text: user.did ? formatPhoneNumber(user.did) : 'No number', detail: null };
    case 'voicemail':
      return { text: user.voicemail ? 'On' : 'Off', detail: null };
    case 'device': {
      if (!user.deviceModel) {
        return { text: 'No device', detail: null };
      }
      const name =
        context.devices.find((device) => device.id === user.deviceModel)?.name ?? user.deviceModel;
      return { text: name, detail: user.macAddress ? `MAC ${user.macAddress}` : null };
    }
  }
}

/** Fields the server filled in because the draft left them out. */
function autoAssigned(draft: DraftLine | undefined, user: UserSnapshot): Set<ReviewField> {
  const auto = new Set<ReviewField>();
  if (draft?.action === 'add_user') {
    if (!draft.extension) {
      auto.add('extension');
    }
    if (!draft.did && user.did) {
      auto.add('did');
    }
  }
  return auto;
}

function cellsFor(
  line: ResolvedLine,
  draft: DraftLine | undefined,
  context: ReviewContext,
): Record<ReviewField, ReviewCell> {
  const cells = {} as Record<ReviewField, ReviewCell>;
  const auto = line.action === 'add_user' ? autoAssigned(draft, line.user) : new Set();
  for (const field of REVIEW_FIELDS) {
    const before = line.action === 'add_user' ? null : fieldValue(field, line.before, context);
    const after =
      line.action === 'add_user'
        ? fieldValue(field, line.user, context)
        : line.action === 'update_user'
          ? fieldValue(field, line.after, context)
          : null;
    cells[field] = {
      before: before?.text ?? null,
      after: after?.text ?? null,
      beforeDetail: before?.detail ?? null,
      afterDetail: after?.detail ?? null,
      changed:
        line.action !== 'update_user' ||
        before?.text !== after?.text ||
        before?.detail !== after?.detail,
      auto: auto.has(field),
    };
  }
  return cells;
}

const subject = (line: ResolvedLine): UserSnapshot =>
  line.action === 'add_user' ? line.user : line.before;

export function reviewRows(
  preview: OrderPreview,
  draft: OrderDraft | null,
  context: ReviewContext,
): ReviewRow[] {
  return preview.lines.map((line, index) => {
    const user = subject(line);
    const issues = preview.issues.filter((issue) => issue.lineIndex === index);
    return {
      index,
      action: line.action,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      cells: cellsFor(line, draft?.lines[index], context),
      issues,
      severity: issues.some((i) => i.severity === 'error')
        ? 'error'
        : issues.length > 0
          ? 'warning'
          : null,
    };
  });
}

/** Issues about the order as a whole, shown above the lines. */
export function orderIssues(preview: OrderPreview): ValidationIssue[] {
  return preview.issues.filter((issue) => issue.lineIndex === null);
}

export function issueCounts(preview: OrderPreview): { errors: number; warnings: number } {
  const errors = preview.issues.filter((issue) => issue.severity === 'error').length;
  return { errors, warnings: preview.issues.length - errors };
}
