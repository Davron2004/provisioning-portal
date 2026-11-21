import { z } from 'zod';
import { E164, Extension, IsoDateTime, MacAddress, PersonName } from './domain';

/** Maximum lines in one order. Keeps a full order under the WebSocket frame limit. */
export const MAX_ORDER_LINES = 100;

/**
 * Order lifecycle: submitted -> validating -> provisioning -> active | failed.
 * `failed` means at least one line failed after retries; failed lines can be retried,
 * which moves the order back to `provisioning`.
 */
export const OrderStatus = z.enum(['submitted', 'validating', 'provisioning', 'active', 'failed']);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['active', 'failed'];

export const LineStatus = z.enum(['pending', 'provisioning', 'succeeded', 'failed']);
export type LineStatus = z.infer<typeof LineStatus>;

export const OrderSource = z.enum(['manual', 'assistant']);
export type OrderSource = z.infer<typeof OrderSource>;

// ---------------------------------------------------------------------------
// Drafts: what a person (or the assistant) asks for. Extension and DID may be
// left out; the server allocates them deterministically during preview.
// ---------------------------------------------------------------------------

export const DraftAddUser = z.object({
  action: z.literal('add_user'),
  siteId: z.string(),
  firstName: PersonName,
  lastName: PersonName,
  email: z.email(),
  extension: Extension.optional(),
  did: E164.optional(),
  voicemail: z.boolean(),
  deviceModel: z.string().nullable(),
  macAddress: MacAddress.nullable().optional(),
});
export type DraftAddUser = z.infer<typeof DraftAddUser>;

export const UserChanges = z
  .object({
    voicemail: z.boolean().optional(),
    /** `null` removes the device. */
    deviceModel: z.string().nullable().optional(),
    macAddress: MacAddress.nullable().optional(),
  })
  .refine((c) => Object.keys(c).length > 0, 'At least one change is required');
export type UserChanges = z.infer<typeof UserChanges>;

export const DraftUpdateUser = z.object({
  action: z.literal('update_user'),
  userId: z.string(),
  changes: UserChanges,
});
export type DraftUpdateUser = z.infer<typeof DraftUpdateUser>;

export const DraftRemoveUser = z.object({
  action: z.literal('remove_user'),
  userId: z.string(),
});
export type DraftRemoveUser = z.infer<typeof DraftRemoveUser>;

export const DraftLine = z.discriminatedUnion('action', [
  DraftAddUser,
  DraftUpdateUser,
  DraftRemoveUser,
]);
export type DraftLine = z.infer<typeof DraftLine>;

export const OrderDraft = z.object({
  lines: z.array(DraftLine).min(1).max(MAX_ORDER_LINES),
});
export type OrderDraft = z.infer<typeof OrderDraft>;

// ---------------------------------------------------------------------------
// Resolved lines: fully specified, ready to provision. Preview returns them,
// the client submits them, and the server re-validates before accepting.
// ---------------------------------------------------------------------------

export const UserSnapshot = z.object({
  firstName: PersonName,
  lastName: PersonName,
  email: z.email(),
  siteId: z.string(),
  extension: Extension,
  did: E164.nullable(),
  voicemail: z.boolean(),
  deviceModel: z.string().nullable(),
  macAddress: MacAddress.nullable(),
});
export type UserSnapshot = z.infer<typeof UserSnapshot>;

export const ResolvedAddUser = z.object({
  action: z.literal('add_user'),
  user: UserSnapshot,
});
export const ResolvedUpdateUser = z.object({
  action: z.literal('update_user'),
  userId: z.string(),
  before: UserSnapshot,
  after: UserSnapshot,
});
export const ResolvedRemoveUser = z.object({
  action: z.literal('remove_user'),
  userId: z.string(),
  before: UserSnapshot,
});

export const ResolvedLine = z.discriminatedUnion('action', [
  ResolvedAddUser,
  ResolvedUpdateUser,
  ResolvedRemoveUser,
]);
export type ResolvedLine = z.infer<typeof ResolvedLine>;

export const IssueSeverity = z.enum(['error', 'warning']);
export type IssueSeverity = z.infer<typeof IssueSeverity>;

/** A deterministic validation finding. `lineIndex` is null for order-level issues. */
export const ValidationIssue = z.object({
  lineIndex: z.number().int().nonnegative().nullable(),
  field: z.string().nullable(),
  code: z.string(),
  message: z.string(),
  severity: IssueSeverity,
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const OrderPreview = z.object({
  accountId: z.string(),
  lines: z.array(ResolvedLine),
  issues: z.array(ValidationIssue),
  summary: z.object({
    adds: z.number().int().nonnegative(),
    updates: z.number().int().nonnegative(),
    removes: z.number().int().nonnegative(),
  }),
  /** True when there are no error-severity issues. */
  valid: z.boolean(),
});
export type OrderPreview = z.infer<typeof OrderPreview>;

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const LineProgress = z.object({
  lineId: z.string(),
  status: LineStatus,
  attempts: z.number().int().nonnegative(),
  /** Human-readable step currently running, e.g. "Reserving number with carrier". */
  step: z.string().nullable(),
  error: z.string().nullable(),
  /** For add_user lines, the id of the created user. */
  userId: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type LineProgress = z.infer<typeof LineProgress>;

export const OrderLine = z.intersection(ResolvedLine, LineProgress);
export type OrderLine = z.infer<typeof OrderLine>;

export const OrderEvent = z.object({
  at: IsoDateTime,
  status: OrderStatus.nullable(),
  lineId: z.string().nullable(),
  message: z.string(),
});
export type OrderEvent = z.infer<typeof OrderEvent>;

export const OrderCounts = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  provisioning: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type OrderCounts = z.infer<typeof OrderCounts>;

export const OrderSummary = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  status: OrderStatus,
  source: OrderSource,
  /** One-line description, e.g. "Add 20 users at Kanata Campus". */
  title: z.string(),
  counts: OrderCounts,
  submittedBy: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type OrderSummary = z.infer<typeof OrderSummary>;

export const Order = OrderSummary.extend({
  /** The plain-English request, when the order came from the assistant. */
  prompt: z.string().nullable(),
  lines: z.array(OrderLine).max(MAX_ORDER_LINES),
  events: z.array(OrderEvent),
});
export type Order = z.infer<typeof Order>;

export const CreateOrderRequest = z.object({
  lines: z.array(ResolvedLine).min(1).max(MAX_ORDER_LINES),
  source: OrderSource,
  prompt: z.string().max(2000).nullable(),
  /** Client-generated; repeated submits with the same key return the same order. */
  idempotencyKey: z.uuid(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;
