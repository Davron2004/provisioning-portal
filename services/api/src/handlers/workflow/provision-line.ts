import type { LineResult, LineTask, LineTaskWithFailure } from '../../workflow/definition';
import { workflowTasks } from '../../workflow/from-env';

/**
 * Step Functions task inside the Map state. With a plain LineTask it
 * provisions the line (throwing ProvisioningTransientError to trigger the
 * retry policy); with `failure` set it is the Catch target and records why
 * the line failed.
 */
export const handler = (input: LineTask | LineTaskWithFailure): Promise<LineResult> =>
  workflowTasks().provisionLine(input);
