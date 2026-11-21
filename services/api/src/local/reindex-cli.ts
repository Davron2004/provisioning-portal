import { createDocumentClient } from '../data/client';
import { createSearchClient } from '../search/client';
import { searchIndexName } from '../search/index-definition';
import { applyHandlerEnvironment, loadLocalConfig } from './config';
import { log } from './log';
import { rebuildSearchIndex, waitForOpenSearch } from './opensearch';

/** Rebuilds the local search index from the table: `npm run reindex -w @provisioning/api`. */
async function main() {
  const config = loadLocalConfig();
  applyHandlerEnvironment(config);
  const doc = createDocumentClient({ endpoint: config.dynamoEndpoint, region: config.region });
  const search = createSearchClient();
  await waitForOpenSearch(search, config.openSearchEndpoint);
  await rebuildSearchIndex({ doc, tableName: config.tableName, search, index: searchIndexName() });
}

main().catch((error: unknown) => {
  log.error('Reindex failed', error);
  process.exit(1);
});
