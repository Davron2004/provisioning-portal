import { createHash } from 'node:crypto';
import type { CreateOrderRequest, OrderDraft, OrderPreview } from '@provisioning/contracts';
import type { Actor } from '../auth/actor';
import type { OrderRecord } from '../data/items';
import type { Repositories } from '../data/repositories';
import { createOrder, requestRetry } from '../domain/order-lifecycle';
import { hasErrors, previewOrder, validateLines } from '../domain/order-validation';
import { ConflictError, NotFoundError, ValidationFailedError } from '../errors';
import { logger } from '../logger';
import type { WorkflowStarter } from '../workflow/starter';
import { loadAccountContext } from './account-context';

export interface OrderServiceDeps {
  repos: Repositories;
  workflow: WorkflowStarter;
  now: () => Date;
  newOrderId: () => string;
}

/**
 * The REST side of orders: preview a draft, accept resolved lines, retry
 * failed lines. Validation here is the same code the workflow re-runs, so a
 * preview the person approved is exactly what gets checked again.
 */
export class OrderService {
  constructor(private readonly deps: OrderServiceDeps) {}

  async preview(accountId: string, draft: OrderDraft): Promise<OrderPreview> {
    const ctx = await loadAccountContext(this.deps.repos, accountId, draft.lines);
    return previewOrder(draft, ctx);
  }

  /**
   * Validates the submitted lines again, stores the order (idempotently) and
   * starts the workflow. A repeated request with the same idempotency key
   * returns the original order and re-starts its workflow if the first
   * start never happened (the execution name makes that a no-op otherwise).
   */
  async create(accountId: string, request: CreateOrderRequest, actor: Actor): Promise<OrderRecord> {
    const { repos, workflow, now } = this.deps;
    const requestHash = hashRequest(request);

    const previous = await repos.orders.findByIdempotencyKey(accountId, request.idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new ConflictError('This idempotency key was already used for a different order');
      }
      const order = await repos.orders.get(accountId, previous.orderId);
      if (!order) throw new NotFoundError(`Order ${previous.orderId} was not found`);
      if (order.status === 'submitted')
        await workflow.start(order.id, { accountId, orderId: order.id });
      return order;
    }

    const ctx = await loadAccountContext(repos, accountId, request.lines);
    const issues = validateLines(request.lines, ctx);
    if (hasErrors(issues)) {
      throw new ValidationFailedError('The order did not pass validation', { issues });
    }

    const order = createOrder({
      id: this.deps.newOrderId(),
      accountId,
      accountName: ctx.account.name,
      lines: request.lines,
      siteNames: new Map(ctx.sites.map((s) => [s.id, s.name])),
      source: request.source,
      prompt: request.prompt,
      submittedBy: actor.email,
      now: now(),
    });
    const { order: stored, created } = await repos.orders.create(
      order,
      { key: request.idempotencyKey, requestHash },
      now(),
    );
    if (created)
      logger.info('order created', { orderId: stored.id, accountId, lines: order.lines.length });
    if (stored.status === 'submitted') {
      await workflow.start(stored.id, { accountId, orderId: stored.id });
    }
    return stored;
  }

  /** Moves a failed order's failed lines back to pending and runs the workflow for just those. */
  async retry(accountId: string, orderId: string, actor: Actor): Promise<OrderRecord> {
    const { repos, workflow, now } = this.deps;
    const existing = await repos.orders.get(accountId, orderId);
    if (!existing) throw new NotFoundError(`Order ${orderId} was not found`);
    if (existing.status !== 'failed') {
      throw new ConflictError(`Order is ${existing.status}; only failed orders can be retried`);
    }
    const { order, result: lineIds } = await repos.orders.mutate(accountId, orderId, (o) => {
      if (o.status !== 'failed') {
        throw new ConflictError(`Order is ${o.status}; only failed orders can be retried`);
      }
      return requestRetry(o, actor.email, now());
    });
    // Each retry is its own execution; the version keeps names unique and repeatable.
    await workflow.start(`${orderId}-retry-${order.version}`, { accountId, orderId, lineIds });
    logger.info('order retry started', { orderId, lines: lineIds.length });
    return order;
  }
}

function hashRequest(request: CreateOrderRequest): string {
  const { idempotencyKey: _key, ...rest } = request;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}
