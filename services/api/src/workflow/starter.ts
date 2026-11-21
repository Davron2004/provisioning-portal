import { ExecutionAlreadyExists, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { WorkflowInput } from './definition';

/** Starts an order workflow run. The execution name makes starts idempotent. */
export interface WorkflowStarter {
  start(executionName: string, input: WorkflowInput): Promise<void>;
}

export class StepFunctionsStarter implements WorkflowStarter {
  constructor(
    private readonly client: SFNClient,
    private readonly stateMachineArn: string,
  ) {}

  async start(executionName: string, input: WorkflowInput): Promise<void> {
    try {
      await this.client.send(
        new StartExecutionCommand({
          stateMachineArn: this.stateMachineArn,
          name: executionName,
          input: JSON.stringify(input),
        }),
      );
    } catch (error) {
      // Same name already started: a repeated request, so the run is already going.
      if (error instanceof ExecutionAlreadyExists) return;
      throw error;
    }
  }
}

/** SFN_ENDPOINT points the client at the local harness's stand-in; unset in AWS. */
export function stepFunctionsStarterFromEnv(stateMachineArn: string): StepFunctionsStarter {
  const endpoint = process.env.SFN_ENDPOINT;
  return new StepFunctionsStarter(new SFNClient(endpoint ? { endpoint } : {}), stateMachineArn);
}
