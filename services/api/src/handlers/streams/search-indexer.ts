import type { DynamoDBStreamEvent } from 'aws-lambda';
import { requireEnv } from '../../config/env';
import { sharedDocumentClient } from '../../data/client';
import { createRepositories } from '../../data/repositories';
import { sharedSearchClient } from '../../search/client';
import { searchIndexName } from '../../search/index-definition';
import { SearchIndexer } from '../../search/indexer';
import { cachedLookups } from '../../search/lookups';

/**
 * DynamoDB Streams consumer (filtered to users, numbers and orders, see
 * STREAM_FILTER_PATTERNS.searchIndexer): keeps the OpenSearch index current.
 * Creates the index with its mappings on first use.
 */
let indexer: SearchIndexer | undefined;

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  if (!indexer) {
    const repos = createRepositories(sharedDocumentClient(), requireEnv('TABLE_NAME'));
    indexer = new SearchIndexer(sharedSearchClient(), searchIndexName(), () =>
      cachedLookups(repos),
    );
  }
  await indexer.handle(event.Records);
};
