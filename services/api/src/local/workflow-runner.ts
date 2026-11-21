import {
  MAP_MAX_CONCURRENCY,
  PROVISION_LINE_RETRY,
  retryDelaySeconds,
  type FinalizeOrderInput,
  type FinalizeOrderOutput,
  type LineResult,
  type LineTask,
  type LineTaskWithFailure,
  type ValidateOrderOutput,
  type WorkflowInput,
} from '../workflow/definition';

/**
 * LOCAL STAND-IN for the Step Functions state machine in
 * src/workflow/definition.ts. It runs the same three Lambda handlers in the
 * same shape: ValidateOrder, a Map over the ready lines with
 * MAP_MAX_CONCURRENCY, PROVISION_LINE_RETRY on ProvisionLine with the Catch
 * to RecordLineFailure, then FinalizeOrder. It does not emulate Lambda
 * service retries, timeouts, execution history or jitter.
 */
export interface WorkflowHandlers {
  validateOrder(input: WorkflowInput): Promise<ValidateOrderOutput>;
  provisionLine(input: LineTask | LineTaskWithFailure): Promise<LineResult>;
  finalizeOrder(input: FinalizeOrderInput): Promise<FinalizeOrderOutput>;
}

export interface RunnerOptions {
  sleep?: (ms: number) => Promise<void>;
}

/** The `{ Error, Cause }` Step Functions builds from a Lambda error. */
export function toStatesError(error: unknown): { Error: string; Cause: string } {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return { Error: name, Cause: JSON.stringify({ errorType: name, errorMessage: message }) };
}

export async function runOrderWorkflow(
  input: WorkflowInput,
  handlers: WorkflowHandlers,
  options: RunnerOptions = {},
): Promise<FinalizeOrderOutput> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let validated: ValidateOrderOutput;
  try {
    validated = await handlers.validateOrder(input);
  } catch (error) {
    return handlers.finalizeOrder({ ...input, failure: toStatesError(error) });
  }

  try {
    const results = await mapWithConcurrency(validated.lines, MAP_MAX_CONCURRENCY, (task) =>
      provisionWithRetry(task, handlers, sleep),
    );
    return await handlers.finalizeOrder({ ...validated, results });
  } catch (error) {
    return handlers.finalizeOrder({ ...validated, failure: toStatesError(error) });
  }
}

async function provisionWithRetry(
  task: LineTask,
  handlers: WorkflowHandlers,
  sleep: (ms: number) => Promise<void>,
): Promise<LineResult> {
  for (let retry = 0; ; retry++) {
    try {
      return await handlers.provisionLine(task);
    } catch (error) {
      const failure = toStatesError(error);
      const retryable = (PROVISION_LINE_RETRY.errorEquals as readonly string[]).includes(
        failure.Error,
      );
      if (retryable && retry < PROVISION_LINE_RETRY.maxAttempts) {
        await sleep(retryDelaySeconds(retry + 1) * 1000);
        continue;
      }
      // Catch -> RecordLineFailure
      return handlers.provisionLine({ ...task, failure });
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
