import { createServer } from 'node:http';
import type { RuntimeConfig } from '@provisioning/contracts';
import { createLocalVerifier } from '../auth/tokens';
import { createDocumentClient } from '../data/client';
import { applyHandlerEnvironment, loadLocalConfig } from './config';
import { log } from './log';
import { indexIsEmpty, rebuildSearchIndex, waitForOpenSearch } from './opensearch';
import { createSearchClient } from '../search/client';
import { searchIndexName } from '../search/index-definition';
import { createRestGateway } from './rest-gateway';
import { isTableEmpty, seedDatabase } from './seed';
import { startStepFunctionsStandIn } from './step-functions';
import { startStreamsPoller } from './streams-poller';
import { ensureTable, waitForDynamo } from './table-setup';
import { startWebSocketGateway } from './websocket-gateway';
import { STREAM_FILTER_PATTERNS } from '../streams/records';

/**
 * Local development harness: runs the real Lambda handlers on a laptop
 * against DynamoDB Local and OpenSearch. See
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
  await waitForDynamo(doc, config.dynamoEndpoint);
  log.info(`DynamoDB Local at ${config.dynamoEndpoint}, table ${config.tableName}`);
  const search = createSearchClient();
  await waitForOpenSearch(search, config.openSearchEndpoint);
  log.info(`OpenSearch at ${config.openSearchEndpoint}, index ${searchIndexName()}`);

  const created = await ensureTable(doc, config.tableName, { reset });
  let seeded = false;
  if (created || (await isTableEmpty(doc, config.tableName))) {
    seeded = true;
    const data = await seedDatabase(doc, config.tableName);
    log.info(
      `Seeded ${data.accounts.length} accounts, ${data.sites.length} sites, ${data.users.length} users, ` +
        `${data.numbers.length} numbers, ${data.orders.length} orders`,
    );
  } else {
    log.info('Table already has data; pass --reset to reseed');
  }
  if (seeded || (await indexIsEmpty(search, searchIndexName()))) {
    await rebuildSearchIndex({
      doc,
      tableName: config.tableName,
      search,
      index: searchIndexName(),
    });
  }

  // Handlers are imported after the environment is set, as a Lambda would see it.
  const [validateOrder, provisionLine, finalizeOrder] = await Promise.all([
    import('../handlers/workflow/validate-order'),
    import('../handlers/workflow/provision-line'),
    import('../handlers/workflow/finalize-order'),
  ]);
  const sfn = await startStepFunctionsStandIn(
    {
      validateOrder: validateOrder.handler,
      provisionLine: provisionLine.handler,
      finalizeOrder: finalizeOrder.handler,
    },
    config.region,
  );
  process.env.SFN_ENDPOINT = sfn.endpoint;
  process.env.STATE_MACHINE_ARN = sfn.stateMachineArn;
  log.info(
    `Step Functions stand-in on ${sfn.endpoint} (provisioning is simulated: ` +
      `${process.env.PROVISIONING_STEP_DELAY_MS ?? '1000-3000'} ms per step, ` +
      `transient failure rate ${process.env.PROVISIONING_TRANSIENT_FAILURE_RATE ?? '0.1'})`,
  );

  const { handler: httpHandler } = await import('../handlers/http');

  // WebSocket API + Management API on one port, as API Gateway serves both from one domain.
  process.env.WS_MANAGEMENT_ENDPOINT = `http://localhost:${config.wsPort}`;
  const [ws, wsAuthorizer, orderNotifier, searchIndexer] = await Promise.all([
    import('../handlers/ws'),
    import('../handlers/ws-authorizer'),
    import('../handlers/streams/order-notifier'),
    import('../handlers/streams/search-indexer'),
  ]);
  const wsServer = await startWebSocketGateway({
    port: config.wsPort,
    region: config.region,
    authorizer: wsAuthorizer.handler,
    handler: ws.handler,
  });
  log.info(`WebSocket API on ws://${config.host}:${config.wsPort}/?token=<idToken>`);

  const poller = await startStreamsPoller({
    endpoint: config.dynamoEndpoint,
    region: config.region,
    tableName: config.tableName,
    consumers: [
      {
        name: 'order-notifier',
        filterPatterns: STREAM_FILTER_PATTERNS.orderNotifier,
        handler: orderNotifier.handler,
      },
      {
        name: 'search-indexer',
        filterPatterns: STREAM_FILTER_PATTERNS.searchIndexer,
        handler: searchIndexer.handler,
      },
    ],
  });
  log.info('Polling the table stream for order-notifier and search-indexer');

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
  log.info(
    `Assistant provider: ${process.env.ASSISTANT_PROVIDER ?? 'rules'}` +
      (process.env.ASSISTANT_PROVIDER && process.env.ASSISTANT_PROVIDER !== 'rules'
        ? ''
        : ' (offline parser; set ASSISTANT_PROVIDER=anthropic or bedrock to use Claude)'),
  );

  const shutdown = () => {
    log.info('Shutting down');
    poller.stop();
    api.close();
    wsServer.close();
    sfn.server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  log.error('Harness failed to start', error);
  process.exit(1);
});
