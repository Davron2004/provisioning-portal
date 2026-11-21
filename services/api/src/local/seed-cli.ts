import { createDocumentClient } from '../data/client';
import { applyHandlerEnvironment, loadLocalConfig } from './config';
import { log } from './log';
import { seedDatabase } from './seed';
import { ensureTable } from './table-setup';

/** Drops and recreates the local table with fresh demo data: `npm run seed -w @provisioning/api`. */
async function main() {
  const config = loadLocalConfig();
  applyHandlerEnvironment(config);
  const doc = createDocumentClient({ endpoint: config.dynamoEndpoint, region: config.region });
  await ensureTable(doc, config.tableName, { reset: true });
  const data = await seedDatabase(doc, config.tableName);
  log.info(
    `Seeded ${config.tableName}: ${data.accounts.length} accounts, ${data.users.length} users, ${data.orders.length} orders`,
  );
}

main().catch((error: unknown) => {
  log.error('Seeding failed', error);
  process.exit(1);
});
