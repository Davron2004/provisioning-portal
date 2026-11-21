import type { ValidateOrderOutput, WorkflowInput } from '../../workflow/definition';
import { workflowTasks } from '../../workflow/from-env';

/** Step Functions task: re-validate the order and claim each line's resources. */
export const handler = (input: WorkflowInput): Promise<ValidateOrderOutput> =>
  workflowTasks().validateOrder(input);
