import type { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { requireEnv } from '../config/env';
import { sharedDocumentClient } from '../data/client';
import { isTableEmpty, seedDatabase } from '../local/seed';
import { logger } from '../logger';

export interface DemoDataSeeder {
  isEmpty(): Promise<boolean>;
  seed(): Promise<{ accounts: number; users: number; orders: number }>;
}

/**
 * CloudFormation custom resource for non-production stages: when the stack is
 * created, fills the empty table with the same deterministic demo dataset the
 * local harness uses. Updates and deletes do nothing, and a table that already
 * has accounts is never touched. The search index fills itself from the table
 * stream.
 */
export function createSeedHandler(seeder: DemoDataSeeder) {
  return async (event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> => {
    const physicalResourceId =
      event.RequestType === 'Create' ? 'demo-data' : event.PhysicalResourceId;
    if (event.RequestType !== 'Create') return { PhysicalResourceId: physicalResourceId };
    if (!(await seeder.isEmpty())) {
      logger.info('demo data skipped: the table already has accounts');
      return { PhysicalResourceId: physicalResourceId, Data: { Seeded: 'false' } };
    }
    const counts = await seeder.seed();
    logger.info('demo data seeded', counts);
    return { PhysicalResourceId: physicalResourceId, Data: { Seeded: 'true' } };
  };
}

let seedHandler: ReturnType<typeof createSeedHandler> | undefined;

export const handler = (event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> => {
  if (!seedHandler) {
    const doc = sharedDocumentClient();
    const tableName = requireEnv('TABLE_NAME');
    seedHandler = createSeedHandler({
      isEmpty: () => isTableEmpty(doc, tableName),
      seed: async () => {
        const data = await seedDatabase(doc, tableName);
        return {
          accounts: data.accounts.length,
          users: data.users.length,
          orders: data.orders.length,
        };
      },
    });
  }
  return seedHandler(event);
};
