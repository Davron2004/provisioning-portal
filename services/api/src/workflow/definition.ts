/**
 * The order workflow as an AWS Step Functions (Standard) state machine.
 *
 *   ValidateOrder -> ProvisionLines (Map, MaxConcurrency 5)
 *                      ProvisionLine  (Retry: ProvisioningTransientError)
 *                        Catch -> RecordLineFailure
 *                 -> FinalizeOrder
 *
 * This module is the single source of truth for the shape: CDK builds the
 * state machine from `orderWorkflowDefinition()` (or mirrors the constants),
 * and the local harness's stand-in runner reads the same constants.
 */

/** Retry policy for a line's ProvisionLine task. */
export const PROVISION_LINE_RETRY = {
  errorEquals: ['ProvisioningTransientError'],
  intervalSeconds: 2,
  backoffRate: 2,
  /** Retries after the first attempt: 3 attempts in total. */
  maxAttempts: 2,
} as const;

/** How many lines of one order are provisioned at the same time. */
export const MAP_MAX_CONCURRENCY = 5;

/** Retries for Lambda service hiccups on every task (AWS-recommended set). */
export const LAMBDA_SERVICE_RETRY = {
  errorEquals: [
    'Lambda.ServiceException',
    'Lambda.AWSLambdaException',
    'Lambda.SdkClientException',
    'Lambda.TooManyRequestsException',
  ],
  intervalSeconds: 1,
  backoffRate: 2,
  maxAttempts: 3,
} as const;

// ---------------------------------------------------------------------------
// Task payloads
// ---------------------------------------------------------------------------

/** State machine input. `lineIds` limits a run to those lines (retries). */
export interface WorkflowInput {
  accountId: string;
  orderId: string;
  lineIds?: string[];
}

export interface LineTask {
  accountId: string;
  orderId: string;
  lineId: string;
}

/** ProvisionLine is also invoked from the Catch with the error that ended the line. */
export interface LineTaskWithFailure extends LineTask {
  failure: { Error: string; Cause: string };
}

export interface ValidateOrderOutput extends WorkflowInput {
  /** Lines that passed validation and hold their resources; the Map iterates these. */
  lines: LineTask[];
}

export interface LineResult {
  lineId: string;
  status: 'succeeded' | 'failed';
}

export interface FinalizeOrderInput extends WorkflowInput {
  /** Missing when ValidateOrder itself failed. */
  lines?: LineTask[];
  results?: LineResult[];
  /** Set when ValidateOrder or the Map itself failed. */
  failure?: { Error: string; Cause: string };
}

export interface FinalizeOrderOutput {
  orderId: string;
  status: 'active' | 'failed';
}

// ---------------------------------------------------------------------------
// Amazon States Language
// ---------------------------------------------------------------------------

export interface WorkflowFunctionArns {
  validateOrder: string;
  provisionLine: string;
  finalizeOrder: string;
}

const retrier = (policy: {
  errorEquals: readonly string[];
  intervalSeconds: number;
  backoffRate: number;
  maxAttempts: number;
}) => ({
  ErrorEquals: [...policy.errorEquals],
  IntervalSeconds: policy.intervalSeconds,
  BackoffRate: policy.backoffRate,
  MaxAttempts: policy.maxAttempts,
});

/** The full ASL definition. Tasks invoke the Lambdas directly (payload in, result out). */
export function orderWorkflowDefinition(arns: WorkflowFunctionArns) {
  return {
    Comment: 'Provision an order: validate, provision each line with retries, finalize.',
    StartAt: 'ValidateOrder',
    States: {
      ValidateOrder: {
        Type: 'Task',
        Resource: arns.validateOrder,
        Retry: [retrier(LAMBDA_SERVICE_RETRY)],
        Catch: [{ ErrorEquals: ['States.ALL'], ResultPath: '$.failure', Next: 'FinalizeOrder' }],
        Next: 'ProvisionLines',
      },
      ProvisionLines: {
        Type: 'Map',
        ItemsPath: '$.lines',
        MaxConcurrency: MAP_MAX_CONCURRENCY,
        ItemProcessor: {
          ProcessorConfig: { Mode: 'INLINE' },
          StartAt: 'ProvisionLine',
          States: {
            ProvisionLine: {
              Type: 'Task',
              Resource: arns.provisionLine,
              Retry: [retrier(PROVISION_LINE_RETRY), retrier(LAMBDA_SERVICE_RETRY)],
              Catch: [
                { ErrorEquals: ['States.ALL'], ResultPath: '$.failure', Next: 'RecordLineFailure' },
              ],
              End: true,
            },
            RecordLineFailure: {
              Type: 'Task',
              Resource: arns.provisionLine,
              Retry: [retrier(LAMBDA_SERVICE_RETRY)],
              End: true,
            },
          },
        },
        ResultPath: '$.results',
        Catch: [{ ErrorEquals: ['States.ALL'], ResultPath: '$.failure', Next: 'FinalizeOrder' }],
        Next: 'FinalizeOrder',
      },
      FinalizeOrder: {
        Type: 'Task',
        Resource: arns.finalizeOrder,
        Retry: [retrier(LAMBDA_SERVICE_RETRY)],
        End: true,
      },
    },
  };
}

/** Delay before retry `n` (1-based), as Step Functions computes it without jitter. */
export function retryDelaySeconds(n: number, policy = PROVISION_LINE_RETRY): number {
  return policy.intervalSeconds * policy.backoffRate ** (n - 1);
}
