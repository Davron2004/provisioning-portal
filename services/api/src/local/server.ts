import { createServer } from 'node:http';
import type { RuntimeConfig } from '@provisioning/contracts';
import { createLocalVerifier } from '../auth/tokens';
import { createDocumentClient } from '../data/client';
import { applyHandlerEnvironment, loadLocalConfig } from './config';
import { log } from './log';
import { createRestGateway } from './rest-gateway';
import { isTableEmpty, seedDatabase } from './seed';
import { ensureTable } from './table-setup';

/**
 * Local development harness: runs the real Lambda handlers on a laptop
 * against DynamoDB Local (and, later, OpenSearch). See
 * docs/detailed-design.md, "Local development harness".
 *
 *   npm run start:local -w @provisioning/api            # seed if the table is empty
 *   npm run start:local -w @provisioning/api -- --reset # drop and reseed
 */
async function main() {
  const reset = process.argv.includes('--reset');
  const config = loadLocalConfig();
  applyHandlerEnvironment(config);

  const doc = createDocumentClient({ endpoint: config.dynamoEndpoint, region: config.region });
  log.info(`DynamoDB Local at ${config.dynamoEndpoint}, table ${config.tableName}`);
  const created = await ensureTable(doc, config.tableName, { reset });
  if (created || (await isTableEmpty(doc, config.tableName))) {
    const data = await seedDatabase(doc, config.tableName);
    log.info(
      `Seeded ${data.accounts.length} accounts, ${data.sites.length} sites, ${data.users.length} users, ` +
        `${data.numbers.length} numbers, ${data.orders.length} orders`,
    );
  } else {
    log.info('Table already has data; pass --reset to reseed');
  }

  // Imported after the environment is set, as a Lambda would see it.
  const { handler: httpHandler } = await import('../handlers/http');

  const apiBase = `http://${config.host}:${config.apiPort}`;
  const runtimeConfig: RuntimeConfig = {
    apiBaseUrl: apiBase,
    websocketUrl: `ws://${config.host}:${config.wsPort}`,
    auth: { mode: 'local', loginUrl: `${apiBase}/auth/login` },
    environment: 'local',
  };
  const gateway = createRestGateway({
    handler: httpHandler,
    verifier: createLocalVerifier(),
    runtimeConfig,
    allowedOrigins: config.allowedOrigins,
  });
  const api = createServer((req, res) => {
    gateway(req, res).catch((error: unknown) => {
      log.error('REST gateway error', error);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => api.listen(config.apiPort, resolve));
  log.info(`REST API on ${apiBase} (config: ${apiBase}/config.json)`);
  log.info(`CORS origins: ${config.allowedOrigins.join(', ')}`);

  const shutdown = () => {
    log.info('Shutting down');
    api.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  log.error('Harness failed to start', error);
  process.exit(1);
});
