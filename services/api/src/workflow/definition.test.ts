import { describe, expect, it } from 'vitest';
import { orderWorkflowDefinition, PROVISION_LINE_RETRY, retryDelaySeconds } from './definition';
import { failureReason } from './tasks';

describe('order workflow definition', () => {
  const asl = orderWorkflowDefinition({
    validateOrder: 'arn:validate',
    provisionLine: 'arn:provision',
    finalizeOrder: 'arn:finalize',
  });

  it('chains validate -> map -> finalize, with failures routed to FinalizeOrder', () => {
    expect(asl.StartAt).toBe('ValidateOrder');
    expect(asl.States.ValidateOrder.Next).toBe('ProvisionLines');
    expect(asl.States.ValidateOrder.Catch[0]).toMatchObject({
      Next: 'FinalizeOrder',
      ResultPath: '$.failure',
    });
    expect(asl.States.ProvisionLines).toMatchObject({
      ItemsPath: '$.lines',
      MaxConcurrency: 5,
      Next: 'FinalizeOrder',
    });
    expect(asl.States.FinalizeOrder.End).toBe(true);
  });

  it('retries ProvisionLine on the transient error only and catches into RecordLineFailure', () => {
    const line = asl.States.ProvisionLines.ItemProcessor.States.ProvisionLine;
    expect(line.Retry[0]).toEqual({
      ErrorEquals: ['ProvisioningTransientError'],
      IntervalSeconds: 2,
      BackoffRate: 2,
      MaxAttempts: 2,
    });
    expect(line.Catch[0]).toMatchObject({ ErrorEquals: ['States.ALL'], Next: 'RecordLineFailure' });
    expect(asl.States.ProvisionLines.ItemProcessor.States.RecordLineFailure.Resource).toBe(
      'arn:provision',
    );
  });

  it('computes the backoff the way Step Functions does', () => {
    expect([1, 2].map((n) => retryDelaySeconds(n, PROVISION_LINE_RETRY))).toEqual([2, 4]);
  });
});

describe('failureReason', () => {
  const cause = (errorType: string, errorMessage: string) =>
    JSON.stringify({ errorType, errorMessage });

  it('explains exhausted retries, permanent errors, timeouts and the unexpected', () => {
    expect(
      failureReason(
        {
          Error: 'ProvisioningTransientError',
          Cause: cause('ProvisioningTransientError', 'Carrier API timed out'),
        },
        3,
      ),
    ).toBe('Carrier API timed out (gave up after 3 attempts)');
    expect(
      failureReason(
        {
          Error: 'ProvisioningPermanentError',
          Cause: cause('ProvisioningPermanentError', 'Rejected'),
        },
        1,
      ),
    ).toBe('Rejected');
    expect(failureReason({ Error: 'States.Timeout', Cause: 'Task timed out' }, 1)).toBe(
      'Provisioning timed out',
    );
    expect(
      failureReason({ Error: 'TypeError', Cause: cause('TypeError', 'x is undefined') }, 1),
    ).toBe('Unexpected error while provisioning: x is undefined');
  });
});
