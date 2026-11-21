import { z } from 'zod';
import { OrderDraft, OrderPreview } from './orders';

/**
 * What the language model is allowed to produce: an *intent*, never concrete
 * provisioning data. Site names, people and device names are free text as the
 * person wrote them; the server resolves them against the account
 * deterministically and turns the intent into an OrderDraft.
 */
export const TargetSelector = z.object({
  /** Site name as written, e.g. "Kanata". Null means any site. */
  site: z.string().nullable(),
  extensions: z.array(z.string()),
  /** Full or partial names as written, e.g. "Priya Shah". */
  names: z.array(z.string()),
  /** True when the request targets every user matching `site`. */
  all: z.boolean(),
});
export type TargetSelector = z.infer<typeof TargetSelector>;

export const IntentPerson = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
});
export type IntentPerson = z.infer<typeof IntentPerson>;

export const AddUsersOperation = z.object({
  op: z.literal('add_users'),
  site: z.string(),
  /** Number of users to add; at least people.length. Unnamed seats get placeholder names. */
  count: z.number().int().min(1).max(100),
  people: z.array(IntentPerson),
  voicemail: z.boolean(),
  /** Device model as written ("basic desk phone"), or null for no device. */
  device: z.string().nullable(),
});

export const UpdateUsersOperation = z.object({
  op: z.literal('update_users'),
  target: TargetSelector,
  set: z.object({
    voicemail: z.boolean().nullable(),
    /** Device as written; "none" removes the device; null leaves it unchanged. */
    device: z.string().nullable(),
  }),
});

export const RemoveUsersOperation = z.object({
  op: z.literal('remove_users'),
  target: TargetSelector,
});

export const IntentOperation = z.discriminatedUnion('op', [
  AddUsersOperation,
  UpdateUsersOperation,
  RemoveUsersOperation,
]);
export type IntentOperation = z.infer<typeof IntentOperation>;

export const OrderIntent = z.object({
  operations: z.array(IntentOperation).max(10),
  /** Parts of the request the model could not map to an operation. */
  unresolved: z.array(z.string()),
});
export type OrderIntent = z.infer<typeof OrderIntent>;

export const InterpretRequest = z.object({
  text: z.string().trim().min(3).max(2000),
});
export type InterpretRequest = z.infer<typeof InterpretRequest>;

export const AssistantProvider = z.enum(['bedrock', 'anthropic', 'rules']);
export type AssistantProvider = z.infer<typeof AssistantProvider>;

export const InterpretResponse = z.object({
  intent: OrderIntent,
  /** Null when the intent could not be turned into any line. */
  draft: OrderDraft.nullable(),
  preview: OrderPreview.nullable(),
  /** Deterministic notes from resolving the intent, e.g. "Matched 'Kanata' to Kanata Campus". */
  notes: z.array(z.string()),
  provider: AssistantProvider,
  model: z.string().nullable(),
});
export type InterpretResponse = z.infer<typeof InterpretResponse>;
