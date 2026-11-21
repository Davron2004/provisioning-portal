import type {
  Order,
  OrderLine,
  OrderSource,
  OrderStatus,
  ResolvedLine,
} from '@provisioning/contracts';
import { countLines } from './order-counts';
import { orderEvent, orderMessages } from './order-events';
import { orderTitle } from './order-title';
import { lineIdFor, lineLabel } from './snapshots';

/**
 * Pure state transitions for an order. Each function mutates the order it is
 * given (the repository hands in a fresh copy inside an optimistic-locking
 * loop) and keeps counts, events and timestamps consistent.
 *
 *   submitted -> validating -> provisioning -> active | failed
 *   failed --(retry failed lines)--> provisioning -> active | failed
 */

export interface NewOrderParams {
  id: string;
  accountId: string;
  accountName: string;
  lines: readonly ResolvedLine[];
  siteNames: ReadonlyMap<string, string>;
  source: OrderSource;
  prompt: string | null;
  submittedBy: string;
  now: Date;
}

export function createOrder(params: NewOrderParams): Order {
  const at = params.now.toISOString();
  const lines: OrderLine[] = params.lines.map((line, index) => {
    const progress = {
      lineId: lineIdFor(index),
      status: 'pending' as const,
      attempts: 0,
      step: null,
      error: null,
      updatedAt: at,
    };
    // Update and remove lines already name their user; adds get one in ValidateOrder.
    return line.action === 'add_user'
      ? { ...line, ...progress, userId: null }
      : { ...line, ...progress };
  });
  return {
    id: params.id,
    accountId: params.accountId,
    accountName: params.accountName,
    status: 'submitted',
    source: params.source,
    title: orderTitle(params.lines, params.siteNames),
    counts: countLines(lines),
    submittedBy: params.submittedBy,
    createdAt: at,
    updatedAt: at,
    completedAt: null,
    prompt: params.prompt,
    lines,
    events: [orderEvent(at, orderMessages.submitted(params.submittedBy), { status: 'submitted' })],
  };
}

function touch(order: Order, now: Date): void {
  order.updatedAt = now.toISOString();
  order.counts = countLines(order.lines);
}

function setStatus(order: Order, status: OrderStatus, message: string, now: Date): void {
  order.status = status;
  order.events.push(orderEvent(now, message, { status }));
  touch(order, now);
}

export function findLine(order: Order, lineId: string): { line: OrderLine; index: number } {
  const index = order.lines.findIndex((l) => l.lineId === lineId);
  if (index < 0) throw new Error(`Order ${order.id} has no line ${lineId}`);
  return { line: order.lines[index]!, index };
}

function lineEvent(order: Order, lineId: string, message: (label: string) => string, now: Date) {
  const { line, index } = findLine(order, lineId);
  order.events.push(orderEvent(now, message(lineLabel(index, line)), { lineId }));
}

export function startValidation(order: Order, lineCount: number, now: Date): void {
  if (order.status === 'submitted') {
    setStatus(order, 'validating', orderMessages.validating(lineCount), now);
  }
}

/** Gives every add line in scope the id its user will be created with (stable across retries). */
export function assignUserIds(order: Order, lineIds: readonly string[], newId: () => string): void {
  for (const lineId of lineIds) {
    const { line } = findLine(order, lineId);
    if (line.action === 'add_user' && line.userId === null) line.userId = newId();
  }
}

/** A line failed validation or its resources could not be claimed. */
export function rejectLine(order: Order, lineId: string, reason: string, now: Date): void {
  const { line } = findLine(order, lineId);
  line.status = 'failed';
  line.error = reason;
  line.step = null;
  line.updatedAt = now.toISOString();
  lineEvent(order, lineId, (label) => orderMessages.lineRejected(label, reason), now);
  touch(order, now);
}

export function startProvisioning(order: Order, lineCount: number, now: Date): void {
  if (lineCount > 0 && order.status !== 'provisioning') {
    setStatus(order, 'provisioning', orderMessages.provisioning(lineCount), now);
  }
}

/** A ProvisionLine attempt begins. */
export function startLineAttempt(
  order: Order,
  lineId: string,
  firstStep: string | null,
  now: Date,
): void {
  const { line } = findLine(order, lineId);
  line.status = 'provisioning';
  line.attempts += 1;
  line.step = firstStep;
  line.updatedAt = now.toISOString();
  touch(order, now);
}

export function setLineStep(order: Order, lineId: string, step: string, now: Date): void {
  const { line } = findLine(order, lineId);
  line.step = step;
  line.updatedAt = now.toISOString();
  touch(order, now);
}

/** A transient error; the state machine will retry the line. */
export function recordTransientError(
  order: Order,
  lineId: string,
  reason: string,
  now: Date,
): void {
  const { line } = findLine(order, lineId);
  line.error = reason;
  line.step = null;
  line.updatedAt = now.toISOString();
  const attempt = line.attempts;
  lineEvent(
    order,
    lineId,
    (label) => orderMessages.lineTransientError(label, reason, attempt),
    now,
  );
  touch(order, now);
}

export function completeLine(order: Order, lineId: string, now: Date): void {
  const { line } = findLine(order, lineId);
  line.status = 'succeeded';
  line.step = null;
  line.error = null;
  line.updatedAt = now.toISOString();
  lineEvent(order, lineId, orderMessages.lineSucceeded, now);
  touch(order, now);
}

export function failLine(order: Order, lineId: string, reason: string, now: Date): void {
  const { line } = findLine(order, lineId);
  line.status = 'failed';
  line.step = null;
  line.error = reason;
  line.updatedAt = now.toISOString();
  lineEvent(order, lineId, (label) => orderMessages.lineFailed(label, reason), now);
  touch(order, now);
}

/** Ends a run: `active` when every line succeeded, otherwise `failed`. */
export function finalizeOrder(order: Order, now: Date): void {
  const failed = order.lines.filter((l) => l.status === 'failed').length;
  const total = order.lines.length;
  const status = failed > 0 ? 'failed' : 'active';
  order.completedAt = now.toISOString();
  setStatus(
    order,
    status,
    failed > 0 ? orderMessages.failed(failed, total) : orderMessages.completed(total),
    now,
  );
}

/** Puts the failed lines of a failed order back to pending and returns their ids. */
export function requestRetry(order: Order, requestedBy: string, now: Date): string[] {
  if (order.status !== 'failed') {
    throw new Error(`Order ${order.id} is ${order.status}; only failed orders can be retried`);
  }
  const lineIds: string[] = [];
  for (const line of order.lines) {
    if (line.status !== 'failed') continue;
    line.status = 'pending';
    line.error = null;
    line.step = null;
    line.updatedAt = now.toISOString();
    lineIds.push(line.lineId);
  }
  order.completedAt = null;
  setStatus(order, 'provisioning', orderMessages.retryRequested(lineIds.length, requestedBy), now);
  return lineIds;
}
