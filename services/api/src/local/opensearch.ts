import type { Client } from '@opensearch-project/opensearch';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createRepositories } from '../data/repositories';
import { reindexAll } from '../search/reindex';
import { log } from './log';

/** Waits until the OpenSearch container answers with a yellow or green cluster. */
export async function waitForOpenSearch(client: Client, endpoint: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  for (;;) {
    try {
      const { body } = await client.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      if (body.status === 'yellow' || body.status === 'green') return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      throw new Error(
        `OpenSearch at ${endpoint} did not become healthy. Is \`docker compose up -d\` running?`,
      );
    }
    if (!announced) {
      log.info(`Waiting for OpenSearch at ${endpoint}...`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Rebuilds the index from the table and logs how many documents went in. */
export async function rebuildSearchIndex(options: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  search: Client;
  index: string;
}) {
  const started = Date.now();
  const count = await reindexAll({
    ...options,
    repos: createRepositories(options.doc, options.tableName),
    recreate: true,
  });
  log.info(
    `Indexed ${count} users, numbers and orders into "${options.index}" in ${Date.now() - started} ms`,
  );
}

export async function indexIsEmpty(search: Client, index: string): Promise<boolean> {
  const exists = await search.indices.exists({ index });
  if (!exists.body) return true;
  const { body } = await search.count({ index });
  return body.count === 0;
}
