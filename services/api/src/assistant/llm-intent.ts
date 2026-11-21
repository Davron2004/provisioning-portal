import { z } from 'zod';
import { OrderIntent } from '@provisioning/contracts';

/**
 * The schema the language model fills in. It has the shape of the contract's
 * OrderIntent but without numeric or length limits, which structured outputs
 * do not enforce, and with descriptions that guide the model. The result is
 * mapped and checked against the contract schema in `toOrderIntent`.
 */
const Target = z.object({
  site: z
    .string()
    .nullable()
    .describe('Site name exactly as the person wrote it, or null if they did not name one'),
  extensions: z.array(z.string()).describe('Extensions mentioned, digits only'),
  names: z.array(z.string()).describe('People mentioned by name, as written'),
  all: z.boolean().describe('True when the request targets every user at the site ("everyone at")'),
});

const Person = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable().describe('Only if the person wrote an email address'),
});

export const LlmIntent = z.object({
  operations: z
    .array(
      z.discriminatedUnion('op', [
        z.object({
          op: z.literal('add_users'),
          site: z.string().describe('Site name as written, e.g. "Kanata"'),
          count: z
            .number()
            .int()
            .describe('How many users to add; at least the number of named people'),
          people: z.array(Person).describe('Named people; unnamed seats are left out'),
          voicemail: z.boolean().describe('True unless the person says no voicemail'),
          device: z
            .string()
            .nullable()
            .describe('Device as written, e.g. "desk phone", or null if none was mentioned'),
        }),
        z.object({
          op: z.literal('update_users'),
          target: Target,
          set: z.object({
            voicemail: z
              .boolean()
              .nullable()
              .describe('New voicemail setting, or null to leave it'),
            device: z
              .string()
              .nullable()
              .describe('New device as written; "none" removes the device; null leaves it'),
          }),
        }),
        z.object({ op: z.literal('remove_users'), target: Target }),
      ]),
    )
    .describe('One entry per distinct change the person asked for'),
  unresolved: z
    .array(z.string())
    .describe('Parts of the request that are not adding, changing or removing phone users'),
});
export type LlmIntent = z.infer<typeof LlmIntent>;

const MAX_OPERATIONS = 10;
const MAX_ADD_COUNT = 100;

/**
 * Maps model output onto the contract. Anything outside the contract's limits
 * becomes an `unresolved` note instead of being silently adjusted, and the
 * result is validated with the contract schema.
 */
export function toOrderIntent(raw: LlmIntent): OrderIntent {
  const unresolved = [...raw.unresolved];
  const operations: OrderIntent['operations'] = [];
  for (const op of raw.operations) {
    if (operations.length >= MAX_OPERATIONS) {
      unresolved.push(`More than ${MAX_OPERATIONS} separate changes; split the request`);
      break;
    }
    if (op.op === 'add_users' && (op.count < 1 || op.count > MAX_ADD_COUNT)) {
      unresolved.push(
        `Adding ${op.count} users at ${op.site}: an order can add between 1 and ${MAX_ADD_COUNT}`,
      );
      continue;
    }
    if (op.op === 'add_users') {
      operations.push({ ...op, count: Math.max(op.count, op.people.length) });
    } else {
      operations.push(op);
    }
  }
  return OrderIntent.parse({ operations, unresolved });
}
