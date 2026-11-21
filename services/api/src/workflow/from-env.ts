import { requireEnv } from '../config/env';
import { sharedDocumentClient } from '../data/client';
import { createRepositories } from '../data/repositories';
import { newUserId } from '../lib/ids';
import { simulatedProvisionerFromEnv } from '../provisioning/simulated-provisioner';
import { OrderWorkflowTasks } from './tasks';

let tasks: OrderWorkflowTasks | undefined;

/** One task runner per Lambda container. Reads TABLE_NAME and the PROVISIONING_* settings. */
export function workflowTasks(): OrderWorkflowTasks {
  tasks ??= new OrderWorkflowTasks({
    repos: createRepositories(sharedDocumentClient(), requireEnv('TABLE_NAME')),
    provisioner: simulatedProvisionerFromEnv(),
    now: () => new Date(),
    newUserId,
  });
  return tasks;
}
