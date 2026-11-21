import type { FinalizeOrderInput, FinalizeOrderOutput } from '../../workflow/definition';
import { workflowTasks } from '../../workflow/from-env';

/** Step Functions task: set the order to `active` or `failed`. */
export const handler = (input: FinalizeOrderInput): Promise<FinalizeOrderOutput> =>
  workflowTasks().finalizeOrder(input);
