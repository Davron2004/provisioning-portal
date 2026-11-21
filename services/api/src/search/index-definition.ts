import type { Client } from '@opensearch-project/opensearch';
import { logger } from '../logger';

/**
 * One index for all searchable entities (users, numbers, orders), told apart
 * by `entity`. The global search box queries everything at once and ranks it
 * together, which one index does in a single request; per-entity indexes
 * would need a multi-search and score merging for no benefit at this size.
 *
 *  - `title` is `search_as_you_type`, so "pri" finds "Priya Shah".
 *  - `text` holds secondary words (email, site, account, order id, prompt),
 *    split on anything that is not a letter or digit, accent-folded.
 *  - `digits` holds phone numbers and extensions as digit strings, indexed as
 *    3-11 character n-grams so "0142", "5550142" and "+1 613 555 0142" all
 *    match. The query side normalises to digits and does not n-gram.
 */
export const SEARCH_INDEX_BODY = {
  settings: {
    index: { number_of_shards: 1, max_ngram_diff: 8 },
    analysis: {
      tokenizer: {
        digit_ngrams: { type: 'ngram', min_gram: 3, max_gram: 11, token_chars: ['digit'] },
        words: { type: 'pattern', pattern: '[^\\p{L}\\p{N}]+' },
      },
      analyzer: {
        folded: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
        words: { type: 'custom', tokenizer: 'words', filter: ['lowercase', 'asciifolding'] },
        digit_ngrams: { type: 'custom', tokenizer: 'digit_ngrams' },
      },
    },
  },
  mappings: {
    dynamic: 'strict',
    properties: {
      entity: { type: 'keyword' },
      id: { type: 'keyword' },
      accountId: { type: 'keyword' },
      accountName: { type: 'keyword' },
      title: { type: 'search_as_you_type', analyzer: 'folded' },
      subtitle: { type: 'text', analyzer: 'folded' },
      status: { type: 'keyword' },
      text: { type: 'text', analyzer: 'words' },
      digits: { type: 'text', analyzer: 'digit_ngrams', search_analyzer: 'keyword' },
      updatedAt: { type: 'date' },
    },
  },
} as const;

export const searchIndexName = () => process.env.OPENSEARCH_INDEX ?? 'provisioning';

/** Creates the index with explicit mappings if it does not exist. Safe to call concurrently. */
export async function ensureIndex(client: Client, index = searchIndexName()): Promise<boolean> {
  const exists = await client.indices.exists({ index });
  if (exists.body) return false;
  try {
    await client.indices.create({ index, body: SEARCH_INDEX_BODY as never });
    logger.info('search index created', { index });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
}

function isAlreadyExists(error: unknown): boolean {
  const body = (error as { meta?: { body?: { error?: { type?: string } } } }).meta?.body;
  return body?.error?.type === 'resource_already_exists_exception';
}
