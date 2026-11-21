import { describe, expect, it } from 'vitest';
import {
  ProvisioningPermanentError,
  ProvisioningTransientError,
} from '../provisioning/provisioner';
import {
  MAP_MAX_CONCURRENCY,
  PROVISION_LINE_RETRY,
  type FinalizeOrderInput,
  type LineTask,
  type LineTaskWithFailure,
} from '../workflow/definition';
import { runOrderWorkflow, toStatesError, type WorkflowHandlers } from './workflow-runner';

const input = { accountId: 'acc', orderId: 'ord' };
const task = (lineId: string): LineTask => ({ ...input, lineId });

function harness(behaviour: (task: LineTask, attempt: number) => Promise<void>, lineCount = 3) {
  const attempts = new Map<string, number>();
  const failures: LineTaskWithFailure[] = [];
  const sleeps: number[] = [];
  let finalized: FinalizeOrderInput | undefined;
  let running = 0;
  let maxRunning = 0;
  const handlers: WorkflowHandlers = {
    validateOrder: async (i) => ({
      ...i,
      lines: Array.from({ length: lineCount }, (_, n) => task(`line-${n + 1}`)),
    }),
    provisionLine: async (t) => {
      if ('failure' in t) {
        failures.push(t);
        return { lineId: t.lineId, status: 'failed' };
      }
      const attempt = (attempts.get(t.lineId) ?? 0) + 1;
      attempts.set(t.lineId, attempt);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        await new Promise((r) => setTimeout(r, 1));
        await behaviour(t, attempt);
      } finally {
        running -= 1;
      }
      return { lineId: t.lineId, status: 'succeeded' };
    },
    finalizeOrder: async (i) => {
      finalized = i;
      return {
        orderId: i.orderId,
        status: i.results?.every((r) => r.status === 'succeeded') ? 'active' : 'failed',
      };
    },
  };
  const run = () =>
    runOrderWorkflow(input, handlers, {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
  return {
    run,
    attempts,
    failures,
    sleeps,
    finalized: () => finalized,
    maxRunning: () => maxRunning,
  };
}

describe('local workflow runner (Step Functions stand-in)', () => {
  it('provisions every line and finalizes with the results', async () => {
    const h = harness(async () => {});
    await expect(h.run()).resolves.toEqual({ orderId: 'ord', status: 'active' });
    expect(h.finalized()?.results?.map((r) => r.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
  });

  it('retries transient errors with the shared backoff policy, then records the failure', async () => {
    const h = harness(async (t) => {
      if (t.lineId === 'line-2') throw new ProvisioningTransientError('Carrier API timed out');
    });
    await expect(h.run()).resolves.toMatchObject({ status: 'failed' });
    expect(h.attempts.get('line-2')).toBe(PROVISION_LINE_RETRY.maxAttempts + 1);
    expect(h.sleeps).toEqual([2000, 4000]);
    expect(h.failures).toEqual([
      {
        ...task('line-2'),
        failure: toStatesError(new ProvisioningTransientError('Carrier API timed out')),
      },
    ]);
  });

  it('recovers when a retry succeeds', async () => {
    const h = harness(async (_t, attempt) => {
      if (attempt === 1) throw new ProvisioningTransientError('busy');
    }, 1);
    await expect(h.run()).resolves.toMatchObject({ status: 'active' });
    expect(h.attempts.get('line-1')).toBe(2);
  });

  it('does not retry permanent errors', async () => {
    const h = harness(async () => {
      throw new ProvisioningPermanentError('rejected');
    }, 1);
    await h.run();
    expect(h.attempts.get('line-1')).toBe(1);
    expect(h.failures[0]!.failure.Error).toBe('ProvisioningPermanentError');
    expect(JSON.parse(h.failures[0]!.failure.Cause)).toEqual({
      errorType: 'ProvisioningPermanentError',
      errorMessage: 'rejected',
    });
  });

  it('never runs more than MAP_MAX_CONCURRENCY lines at once', async () => {
    const h = harness(async () => {}, 12);
    await h.run();
    expect(h.maxRunning()).toBe(MAP_MAX_CONCURRENCY);
  });

  it('sends a crashed validation straight to FinalizeOrder with the failure', async () => {
    const h = harness(async () => {});
    const finalize: FinalizeOrderInput[] = [];
    await runOrderWorkflow(input, {
      validateOrder: async () => {
        throw new Error('boom');
      },
      provisionLine: async () => ({ lineId: 'x', status: 'succeeded' }),
      finalizeOrder: async (i) => {
        finalize.push(i);
        return { orderId: 'ord', status: 'failed' };
      },
    });
    expect(finalize[0]).toEqual({ ...input, failure: toStatesError(new Error('boom')) });
    expect(h.finalized()).toBeUndefined();
  });
});
