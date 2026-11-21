import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreateOrderRequest, DraftLine, Order, ResolvedLine } from '@provisioning/contracts';
import type { Actor } from '../auth/actor';
import { createRepositories, type Repositories } from '../data/repositories';
import { ConflictError } from '../errors';
import { newOrderId, newUserId } from '../lib/ids';
import { seededRandom } from '../lib/random';
import { runOrderWorkflow } from '../local/workflow-runner';
import { generateSeed, type SeedData } from '../local/seed/generate';
import { seedItems, writeItems } from '../local/seed/write';
import { OrderService } from '../orders/order-service';
import { ProvisioningPermanentError, type Provisioner } from '../provisioning/provisioner';
import { SimulatedProvisioner } from '../provisioning/simulated-provisioner';
import { createTestTable, type TestTable } from '../test-support/dynamo';
import type { WorkflowInput } from './definition';
import { OrderWorkflowTasks } from './tasks';

const ACCOUNT = 'acc_lumen-ridge';
const KANATA = 'site_lr-kanata';
const actor: Actor = { id: 'local-admin', email: 'admin@example.com', name: 'Avery Clarke' };

let table: TestTable;
let repos: Repositories;
let seed: SeedData;
let service: OrderService;
const started: { name: string; input: WorkflowInput }[] = [];
/** Lines (by user email) whose next provisioning attempt fails permanently. */
const failOnce = new Set<string>();

beforeAll(async () => {
  table = await createTestTable();
  seed = generateSeed(new Date());
  await writeItems(table.doc, table.tableName, seedItems(seed));
  repos = createRepositories(table.doc, table.tableName);
  service = new OrderService({
    repos,
    workflow: {
      start: async (name, input) => {
        started.push({ name, input });
      },
    },
    now: () => new Date(),
    newOrderId,
  });
});

afterAll(() => table?.drop());

function tasks(): OrderWorkflowTasks {
  const simulated = new SimulatedProvisioner({
    transientFailureRate: 0,
    stepDelayMs: { min: 0, max: 5 },
    random: seededRandom(7),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  const provisioner: Provisioner = {
    plan: (line) => simulated.plan(line),
    runStep: async (step, context) => {
      const email =
        context.line.action === 'add_user' ? context.line.user.email : context.line.before.email;
      if (failOnce.delete(email))
        throw new ProvisioningPermanentError('Call server rejected the request');
      return simulated.runStep(step, context);
    },
  };
  return new OrderWorkflowTasks({ repos, provisioner, now: () => new Date(), newUserId });
}

/** Runs the workflow the way the harness does, minus the real backoff waits. */
async function runWorkflow(input: WorkflowInput) {
  const t = tasks();
  return runOrderWorkflow(
    input,
    {
      validateOrder: (i) => t.validateOrder(i),
      provisionLine: (i) => t.provisionLine(i),
      finalizeOrder: (i) => t.finalizeOrder(i),
    },
    { sleep: async () => {} },
  );
}

async function submit(lines: DraftLine[]): Promise<Order> {
  const preview = await service.preview(ACCOUNT, { lines });
  expect(preview.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return create(preview.lines);
}

function create(lines: ResolvedLine[], key: string = randomUUID()) {
  const request: CreateOrderRequest = {
    lines,
    source: 'manual',
    prompt: null,
    idempotencyKey: key,
  };
  return service.create(ACCOUNT, request, actor);
}

const addLine = (first: string, last: string, extra: Partial<DraftLine> = {}): DraftLine =>
  ({
    action: 'add_user',
    siteId: KANATA,
    firstName: first,
    lastName: last,
    email: `${first}.${last}@lumenridge.example.com`.toLowerCase(),
    voicemail: true,
    deviceModel: 'desk-d400',
    macAddress: null,
    ...extra,
  }) as DraftLine;

describe('order workflow against DynamoDB Local', () => {
  it('provisions adds, updates and removes, and keeps numbers and counters right', async () => {
    const before = (await repos.accounts.get(ACCOUNT))!;
    const kanataBefore = (await repos.accounts.getSite(ACCOUNT, KANATA))!;
    const leaver = seed.users.find((u) => u.siteId === KANATA && u.did && u.status === 'active')!;
    const updated = seed.users.find(
      (u) => u.siteId === KANATA && u.status === 'active' && u.id !== leaver.id && !u.lastOrderId,
    )!;

    const order = await submit([
      addLine('Priya', 'Shah', { macAddress: '02:AB:00:00:00:01' }),
      addLine('Tom', 'Lee', {
        email: 'tom.lee+flaky@lumenridge.example.com',
        deviceModel: 'softphone',
      }),
      { action: 'update_user', userId: updated.id, changes: { voicemail: !updated.voicemail } },
      { action: 'remove_user', userId: leaver.id },
    ]);
    expect(order.status).toBe('submitted');
    expect(started.at(-1)).toEqual({
      name: order.id,
      input: { accountId: ACCOUNT, orderId: order.id },
    });

    const result = await runWorkflow({ accountId: ACCOUNT, orderId: order.id });
    expect(result).toEqual({ orderId: order.id, status: 'active' });

    const done = (await repos.orders.get(ACCOUNT, order.id))!;
    expect(done.lines.map((l) => [l.status, l.attempts])).toEqual([
      ['succeeded', 1],
      ['succeeded', 2], // +flaky: one transient failure, then the retry succeeds
      ['succeeded', 1],
      ['succeeded', 1],
    ]);
    expect(done.events.map((e) => e.status).filter(Boolean)).toEqual([
      'submitted',
      'validating',
      'provisioning',
      'active',
    ]);

    const priya = (await repos.users.get(ACCOUNT, done.lines[0]!.userId!))!;
    expect(priya).toMatchObject({ status: 'active', pendingOrderId: null, lastOrderId: order.id });
    expect(await repos.numbers.get(ACCOUNT, priya.did!)).toMatchObject({
      status: 'assigned',
      userId: priya.id,
      orderId: null,
    });
    expect((await repos.users.get(ACCOUNT, updated.id))!.voicemail).toBe(!updated.voicemail);
    expect(await repos.users.get(ACCOUNT, leaver.id)).toBeNull();
    expect(await repos.numbers.get(ACCOUNT, leaver.did!)).toMatchObject({
      status: 'available',
      userId: null,
    });

    const after = (await repos.accounts.get(ACCOUNT))!;
    expect(after.userCount).toBe(before.userCount + 1);
    expect(after.numbersAssigned).toBe(before.numbersAssigned + 1);
    const kanataAfter = (await repos.accounts.getSite(ACCOUNT, KANATA))!;
    expect(kanataAfter.numbersAvailable).toBe(kanataBefore.numbersAvailable - 1);

    // The MAC is now taken across the platform.
    const again = await service.preview(ACCOUNT, {
      lines: [addLine('Ana', 'Lopez', { macAddress: '02:AB:00:00:00:01' })],
    });
    expect(again.issues.map((i) => i.code)).toContain('mac_in_use');
  });

  it('marks a permanently failed line, keeps its number reserved, and retries just that line', async () => {
    const order = await submit([addLine('Grace', 'Okoye'), addLine('Ines', 'Moreau')]);
    failOnce.add('ines.moreau@lumenridge.example.com');
    await expect(runWorkflow({ accountId: ACCOUNT, orderId: order.id })).resolves.toMatchObject({
      status: 'failed',
    });

    const failed = (await repos.orders.get(ACCOUNT, order.id))!;
    const line = failed.lines[1]!;
    expect(line).toMatchObject({ status: 'failed', error: 'Call server rejected the request' });
    const ines = (await repos.users.get(ACCOUNT, line.userId!))!;
    expect(ines).toMatchObject({ status: 'failed', pendingOrderId: null });
    expect(await repos.numbers.get(ACCOUNT, ines.did!)).toMatchObject({
      status: 'reserved',
      orderId: order.id,
    });

    const retried = await service.retry(ACCOUNT, order.id, actor);
    expect(retried.status).toBe('provisioning');
    const start = started.at(-1)!;
    expect(start.input).toEqual({ accountId: ACCOUNT, orderId: order.id, lineIds: ['line-2'] });
    await expect(service.retry(ACCOUNT, order.id, actor)).rejects.toThrow(ConflictError);

    await expect(runWorkflow(start.input)).resolves.toMatchObject({ status: 'active' });
    const done = (await repos.orders.get(ACCOUNT, order.id))!;
    expect(done.lines.map((l) => [l.status, l.attempts])).toEqual([
      ['succeeded', 1],
      ['succeeded', 2],
    ]);
    expect(await repos.users.get(ACCOUNT, line.userId!)).toMatchObject({ status: 'active' });
    expect(await repos.numbers.get(ACCOUNT, ines.did!)).toMatchObject({
      status: 'assigned',
      orderId: null,
    });
  });

  it('never hands the same number to two concurrent orders', async () => {
    const accountBefore = (await repos.accounts.get(ACCOUNT))!;
    // Both previews see the same free number; both orders pass the API's validation.
    const a = await service.preview(ACCOUNT, { lines: [addLine('Race', 'One')] });
    const b = await service.preview(ACCOUNT, { lines: [addLine('Race', 'Two')] });
    expect(a.lines[0]).toMatchObject({ user: { did: expect.any(String) } });
    const did = a.lines[0]!.action === 'add_user' ? a.lines[0]!.user.did : null;
    expect(b.lines[0]).toMatchObject({ user: { did } });
    const [orderA, orderB] = await Promise.all([create(a.lines), create(b.lines)]);

    const results = await Promise.all([
      runWorkflow({ accountId: ACCOUNT, orderId: orderA.id }),
      runWorkflow({ accountId: ACCOUNT, orderId: orderB.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['active', 'failed']);

    const loser = (await repos.orders.get(
      ACCOUNT,
      results.find((r) => r.status === 'failed')!.orderId,
    ))!;
    expect(loser.lines[0]!.error).toMatch(/(is no longer available|Extension \d+ is already)/);
    const number = (await repos.numbers.get(ACCOUNT, did!))!;
    expect(number.status).toBe('assigned');
    const accountAfter = (await repos.accounts.get(ACCOUNT))!;
    expect(accountAfter.userCount).toBe(accountBefore.userCount + 1);
    expect(accountAfter.numbersAssigned).toBe(accountBefore.numbersAssigned + 1);
  });

  it('returns the same order for a repeated idempotency key and refuses a reused key', async () => {
    const preview = await service.preview(ACCOUNT, { lines: [addLine('Kofi', 'Osei')] });
    const key = randomUUID();
    const first = await create(preview.lines, key);
    const second = await create(preview.lines, key);
    expect(second.id).toBe(first.id);
    const other = await service.preview(ACCOUNT, { lines: [addLine('Mira', 'Rossi')] });
    await expect(create(other.lines, key)).rejects.toThrow(ConflictError);
    await runWorkflow({ accountId: ACCOUNT, orderId: first.id });
  });
});
