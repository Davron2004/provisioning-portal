import type { Order, OrderLine } from '@provisioning/contracts';
import type { UserRecord } from '../data/items';
import type { Repositories } from '../data/repositories';
import { WriteConflictError } from '../data/transactions';
import {
  assignUserIds,
  completeLine,
  failLine,
  finalizeOrder,
  findLine,
  recordTransientError,
  rejectLine,
  setLineStep,
  startLineAttempt,
  startProvisioning,
  startValidation,
} from '../domain/order-lifecycle';
import { validateLines } from '../domain/order-validation';
import { logger } from '../logger';
import { loadAccountContext } from '../orders/account-context';
import type { Provisioner } from '../provisioning/provisioner';
import { ProvisioningTransientError } from '../provisioning/provisioner';
import type {
  FinalizeOrderInput,
  FinalizeOrderOutput,
  LineResult,
  LineTask,
  LineTaskWithFailure,
  ValidateOrderOutput,
  WorkflowInput,
} from './definition';

export interface WorkflowDeps {
  repos: Repositories;
  provisioner: Provisioner;
  now: () => Date;
  newUserId: () => string;
}

/**
 * The three Step Functions tasks. Handlers in src/handlers/workflow are thin
 * wrappers around these; the local runner calls the same handlers.
 *
 * Every task is safe to run twice (Step Functions and Lambda both retry):
 * finished lines and finished orders are left alone, and claims check
 * whether this order already holds the resource.
 */
export class OrderWorkflowTasks {
  constructor(private readonly deps: WorkflowDeps) {}

  /**
   * Re-validates the lines in scope against the account as it is now and
   * claims their resources (user lock, email, extension, number, MAC) with
   * conditional writes. Lines that fail either step are rejected; the rest
   * go on to ProvisionLine.
   */
  async validateOrder(input: WorkflowInput): Promise<ValidateOrderOutput> {
    const { repos, now } = this.deps;
    const { accountId, orderId } = input;
    const inScope = (o: Order) =>
      o.lines.filter(
        (l) => l.status === 'pending' && (!input.lineIds || input.lineIds.includes(l.lineId)),
      );

    const { order } = await repos.orders.mutate(accountId, orderId, (o) => {
      const scope = inScope(o);
      startValidation(o, scope.length, now());
      assignUserIds(
        o,
        scope.map((l) => l.lineId),
        this.deps.newUserId,
      );
    });
    const scope = inScope(order);
    const ctx = await loadAccountContext(repos, accountId, scope);

    // Users this order already created (a retried add) are not conflicts with themselves.
    const ownNewUsers = new Set(
      scope
        .filter((l) => l.action === 'add_user')
        .map((l) => l.userId)
        .filter(Boolean),
    );
    const issues = validateLines(
      scope,
      { ...ctx, users: ctx.users.filter((u) => !ownNewUsers.has(u.id)) },
      { orderId },
    );
    const rejections = new Map<string, string>();
    for (const issue of issues) {
      if (issue.severity !== 'error') continue;
      const targets = issue.lineIndex === null ? scope : [scope[issue.lineIndex]!];
      for (const line of targets)
        if (!rejections.has(line.lineId)) rejections.set(line.lineId, issue.message);
    }

    const users = new Map(ctx.users.map((u) => [u.id, u]));
    const ready: LineTask[] = [];
    for (const line of scope) {
      if (rejections.has(line.lineId)) continue;
      try {
        await this.claim(order, line, users.get(line.userId ?? ''));
        ready.push({ accountId, orderId, lineId: line.lineId });
      } catch (error) {
        if (!(error instanceof WriteConflictError)) throw error;
        rejections.set(line.lineId, error.message);
      }
    }

    await repos.orders.mutate(accountId, orderId, (o) => {
      for (const [lineId, reason] of rejections) rejectLine(o, lineId, reason, now());
      startProvisioning(o, ready.length, now());
    });
    logger.info('order validated', { orderId, ready: ready.length, rejected: rejections.size });
    return { ...input, lines: ready };
  }

  /**
   * Runs the provisioning steps for one line, updating the order's `step` as
   * it goes, then commits the change. Transient errors are recorded and
   * rethrown so the state machine retries; permanent ones are rethrown and
   * end up in recordLineFailure via the Catch.
   */
  async provisionLine(input: LineTask | LineTaskWithFailure): Promise<LineResult> {
    if ('failure' in input) return this.recordLineFailure(input);
    const { repos, provisioner, now } = this.deps;
    const { accountId, orderId, lineId } = input;

    const current = await repos.orders.get(accountId, orderId);
    if (!current) throw new Error(`Order ${orderId} was not found`);
    const existing = findLine(current, lineId).line;
    if (existing.status === 'succeeded' || existing.status === 'failed') {
      return { lineId, status: existing.status };
    }

    const steps = provisioner.plan(existing);
    const { order } = await repos.orders.mutate(accountId, orderId, (o) =>
      startLineAttempt(o, lineId, steps[0] ?? null, now()),
    );
    const line = findLine(order, lineId).line;

    try {
      for (const [index, step] of steps.entries()) {
        if (index > 0) {
          await repos.orders.mutate(accountId, orderId, (o) => setLineStep(o, lineId, step, now()));
        }
        await provisioner.runStep(step, { line, orderId, lineId, attempt: line.attempts });
      }
    } catch (error) {
      if (error instanceof ProvisioningTransientError) {
        await repos.orders.mutate(accountId, orderId, (o) =>
          recordTransientError(o, lineId, error.message, now()),
        );
      }
      throw error;
    }

    await this.commit(order, line);
    await repos.orders.mutate(accountId, orderId, (o) => completeLine(o, lineId, now()));
    return { lineId, status: 'succeeded' };
  }

  /** Called from the ProvisionLine Catch: marks the line failed and releases what it held. */
  async recordLineFailure(input: LineTaskWithFailure): Promise<LineResult> {
    const { repos, now } = this.deps;
    const { accountId, orderId, lineId } = input;
    const order = await repos.orders.get(accountId, orderId);
    if (!order) throw new Error(`Order ${orderId} was not found`);
    const line = findLine(order, lineId).line;
    if (line.status === 'succeeded' || line.status === 'failed')
      return { lineId, status: line.status };

    const reason = failureReason(input.failure, line.attempts);
    await this.release(order, line);
    await repos.orders.mutate(accountId, orderId, (o) => failLine(o, lineId, reason, now()));
    logger.warn('order line failed', { orderId, lineId, reason });
    return { lineId, status: 'failed' };
  }

  /** Sets the final status. Lines that never reported (a crash) are failed and released. */
  async finalizeOrder(input: FinalizeOrderInput): Promise<FinalizeOrderOutput> {
    const { repos, now } = this.deps;
    const { accountId, orderId } = input;
    const order = await repos.orders.get(accountId, orderId);
    if (!order) throw new Error(`Order ${orderId} was not found`);
    if (order.status === 'active' || order.status === 'failed') {
      return { orderId, status: order.status };
    }

    const unfinished = order.lines.filter(
      (l) => l.status === 'pending' || l.status === 'provisioning',
    );
    for (const line of unfinished) await this.release(order, line);
    const reason = input.failure
      ? 'Provisioning stopped because of an internal error; retry the order'
      : 'The line did not report a result; retry the order';
    const { order: done } = await repos.orders.mutate(accountId, orderId, (o) => {
      for (const line of unfinished) failLine(o, line.lineId, reason, now());
      finalizeOrder(o, now());
    });
    if (input.failure) logger.error('order workflow failed', { orderId, failure: input.failure });
    logger.info('order finalized', { orderId, status: done.status });
    return { orderId, status: done.status as FinalizeOrderOutput['status'] };
  }

  // -------------------------------------------------------------------------

  private async claim(
    order: Order,
    line: OrderLine,
    existing: UserRecord | undefined,
  ): Promise<void> {
    const { provisioning } = this.deps.repos;
    const at = this.deps.now();
    if (line.action === 'add_user') {
      if (existing) {
        // Retry of an add that failed after its user was created: just re-lock it.
        await provisioning.claimExistingUser(existing, order.id, 'provisioning', at);
        return;
      }
      const u = line.user;
      await provisioning.claimNewUser(
        {
          id: line.userId!,
          accountId: order.accountId,
          siteId: u.siteId,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          extension: u.extension,
          did: u.did,
          voicemail: u.voicemail,
          device: u.deviceModel ? { model: u.deviceModel, macAddress: u.macAddress } : null,
          status: 'provisioning',
          lastOrderId: order.id,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
          pendingOrderId: order.id,
        },
        order.id,
        at,
      );
      return;
    }
    if (!existing) throw new WriteConflictError('The user no longer exists', 0);
    if (line.action === 'update_user') {
      const newMac =
        line.after.macAddress !== line.before.macAddress ? line.after.macAddress : null;
      await provisioning.claimExistingUser(existing, order.id, 'provisioning', at, newMac);
    } else {
      await provisioning.claimExistingUser(existing, order.id, 'removing', at);
    }
  }

  private async commit(order: Order, line: OrderLine): Promise<void> {
    const { users, provisioning } = this.deps.repos;
    const user = await users.get(order.accountId, line.userId!);
    if (!user) throw new Error(`User ${line.userId} disappeared while ${order.id} was running`);
    const at = this.deps.now();
    if (line.action === 'add_user') await provisioning.commitNewUser(user, order.id, at);
    else if (line.action === 'update_user')
      await provisioning.commitUpdate(user, line.after, order.id, at);
    else await provisioning.commitRemoval(user, order.id, at);
  }

  /** Best effort: a line that never claimed anything has nothing to release. */
  private async release(order: Order, line: OrderLine): Promise<void> {
    if (!line.userId) return;
    const user = await this.deps.repos.users.get(order.accountId, line.userId);
    if (!user || user.pendingOrderId !== order.id) return;
    const newMac =
      line.action === 'update_user' && line.after.macAddress !== line.before.macAddress
        ? line.after.macAddress
        : null;
    await this.deps.repos.provisioning.releaseFailedUser(user, order.id, this.deps.now(), newMac);
  }
}

/**
 * Turns a Step Functions error ({ Error, Cause }) into a message for the
 * line. Lambda puts `{ errorType, errorMessage }` JSON in Cause.
 */
export function failureReason(failure: { Error: string; Cause: string }, attempts: number): string {
  let message = failure.Cause;
  try {
    const parsed = JSON.parse(failure.Cause) as { errorMessage?: unknown };
    if (typeof parsed.errorMessage === 'string') message = parsed.errorMessage;
  } catch {
    // Cause is not JSON (States.Timeout and friends); use it as is.
  }
  if (failure.Error === 'ProvisioningTransientError') {
    return `${message} (gave up after ${attempts} attempts)`;
  }
  if (failure.Error === 'ProvisioningPermanentError') return message;
  if (failure.Error === 'States.Timeout') return 'Provisioning timed out';
  return `Unexpected error while provisioning: ${message}`;
}
