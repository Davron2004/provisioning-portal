import type { DynamoDBRecord } from 'aws-lambda';
import type { Client } from '@opensearch-project/opensearch';
import { toOrder, toPhoneNumber, toUser, type Item } from '../data/items';
import { Entity } from '../data/table';
import { logger } from '../logger';
import { entityOf, recordImage } from '../streams/records';
import {
  documentId,
  numberDocument,
  orderDocument,
  userDocument,
  type SearchDocument,
  type SearchLookups,
} from './documents';
import { ensureIndex } from './index-definition';

type Operation = { kind: 'index'; doc: SearchDocument } | { kind: 'delete'; id: string };

/** Builds the search document for a table item, or null if the item is not searchable. */
export async function documentFor(
  item: Item,
  lookups: SearchLookups,
): Promise<SearchDocument | null> {
  switch (entityOf(item)) {
    case Entity.User:
      return userDocument(toUser(item), lookups);
    case Entity.Number:
      return numberDocument(toPhoneNumber(item), lookups);
    case Entity.Order:
      return orderDocument(toOrder(item));
    default:
      return null;
  }
}

function deletedId(item: Item): string | null {
  switch (entityOf(item)) {
    case Entity.User:
      return documentId('user', String(item.id));
    case Entity.Number:
      return documentId('number', String(item.e164));
    case Entity.Order:
      return documentId('order', String(item.id));
    default:
      return null;
  }
}

/**
 * Keeps the search index in step with the table, fed by DynamoDB Streams.
 * Each batch becomes one bulk request; within a batch only the last change
 * to a document is sent. Failures throw so Lambda retries the batch (index
 * and delete are idempotent).
 */
export class SearchIndexer {
  private indexReady: Promise<boolean> | undefined;

  constructor(
    private readonly client: Client,
    private readonly index: string,
    private readonly lookups: () => SearchLookups,
  ) {}

  async handle(records: readonly DynamoDBRecord[]): Promise<{ indexed: number; deleted: number }> {
    const lookups = this.lookups();
    const operations = new Map<string, Operation>();
    for (const record of records) {
      if (record.eventName === 'REMOVE') {
        const id = deletedId(recordImage(record, 'OldImage') ?? {});
        if (id) operations.set(id, { kind: 'delete', id });
        continue;
      }
      const doc = await documentFor(recordImage(record) ?? {}, lookups);
      if (doc) operations.set(documentId(doc.entity, doc.id), { kind: 'index', doc });
    }
    if (operations.size === 0) return { indexed: 0, deleted: 0 };

    this.indexReady ??= ensureIndex(this.client, this.index).catch((error: unknown) => {
      this.indexReady = undefined;
      throw error;
    });
    await this.indexReady;
    const body = [...operations.entries()].flatMap(([id, op]): object[] =>
      op.kind === 'index'
        ? [{ index: { _index: this.index, _id: id } }, op.doc]
        : [{ delete: { _index: this.index, _id: id } }],
    );
    const response = await this.client.bulk({ body: body as never });
    const failed = (response.body.items ?? []).filter((entry) => {
      const result = Object.values(entry)[0] as { status?: number } | undefined;
      // Deleting a document that was never indexed is fine.
      return result && (result.status ?? 200) >= 300 && result.status !== 404;
    });
    if (failed.length > 0) {
      logger.error('search bulk request had failures', { failed: failed.slice(0, 5) });
      throw new Error(`${failed.length} search index operations failed`);
    }
    const deleted = [...operations.values()].filter((op) => op.kind === 'delete').length;
    return { indexed: operations.size - deleted, deleted };
  }
}
