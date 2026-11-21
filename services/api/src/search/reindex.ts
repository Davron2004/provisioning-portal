import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Client } from '@opensearch-project/opensearch';
import type { Repositories } from '../data/repositories';
import { Entity } from '../data/table';
import { documentFor } from './indexer';
import { documentId } from './documents';
import { ensureIndex } from './index-definition';
import { cachedLookups } from './lookups';

/**
 * Rebuilds the search index from the table: drops it (optionally), recreates
 * it with the explicit mappings, then scans users, numbers and orders and
 * bulk-indexes them. Used after seeding, and as the backfill if the index is
 * ever lost; stream updates that arrive meanwhile are idempotent upserts.
 */
export async function reindexAll(options: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  repos: Pick<Repositories, 'accounts' | 'users'>;
  search: Client;
  index: string;
  recreate?: boolean;
}): Promise<number> {
  const { doc, tableName, search, index } = options;
  if (options.recreate) {
    await search.indices.delete({ index, ignore_unavailable: true });
  }
  await ensureIndex(search, index);
  const lookups = cachedLookups(options.repos);
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'entity IN (:user, :number, :order)',
        ExpressionAttributeValues: {
          ':user': Entity.User,
          ':number': Entity.Number,
          ':order': Entity.Order,
        },
        ExclusiveStartKey: startKey,
      }),
    );
    startKey = page.LastEvaluatedKey;
    const docs = (
      await Promise.all((page.Items ?? []).map((item) => documentFor(item, lookups)))
    ).filter((d) => d !== null);
    if (docs.length === 0) continue;
    const response = await search.bulk({
      body: docs.flatMap((d) => [{ index: { _index: index, _id: documentId(d.entity, d.id) } }, d]),
    });
    if (response.body.errors) throw new Error('Some documents could not be indexed during reindex');
    count += docs.length;
  } while (startKey);
  await search.indices.refresh({ index });
  return count;
}
