import type { OrderEvent, OrderStatus } from '@provisioning/contracts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Wording of the order timeline. Shared by the workflow and the seed so history reads the same. */
export const orderMessages = {
  submitted: (by: string) => `Order submitted by ${by}`,
  validating: (lines: number) => `Validating ${plural(lines, 'line')}`,
  provisioning: (lines: number) => `Provisioning ${plural(lines, 'line')}`,
  lineRejected: (label: string, reason: string) => `${label} rejected: ${reason}`,
  lineSucceeded: (label: string) => `${label} provisioned`,
  lineTransientError: (label: string, reason: string, attempt: number) =>
    `${label}: ${reason} (attempt ${attempt})`,
  lineFailed: (label: string, reason: string) => `${label} failed: ${reason}`,
  completed: (total: number) => `Order completed: all ${plural(total, 'line')} provisioned`,
  failed: (failed: number, total: number) =>
    `Order failed: ${failed} of ${plural(total, 'line')} failed`,
  retryRequested: (lines: number, by: string) =>
    `Retry of ${plural(lines, 'failed line')} requested by ${by}`,
};

export function orderEvent(
  at: Date | string,
  message: string,
  options: { status?: OrderStatus | null; lineId?: string | null } = {},
): OrderEvent {
  return {
    at: typeof at === 'string' ? at : at.toISOString(),
    status: options.status ?? null,
    lineId: options.lineId ?? null,
    message,
  };
}
