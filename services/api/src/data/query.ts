import {
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { decodeCursor, encodeCursor } from './cursor';
import type { Item } from './items';

export interface PageRequest {
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Upper bound on extra round trips when a FilterExpression leaves a page short. */
const MAX_FILTER_ROUND_TRIPS = 5;

/**
 * Runs one page of a Query. `partition` is the key condition's partition
 * attribute and value; it is used to check that an incoming cursor belongs to
 * this query. When the input has a FilterExpression the query is repeated
 * (bounded) until the page is full, so filtered lists do not return a run of
 * empty pages.
 */
export async function queryPage<T>(
  doc: DynamoDBDocumentClient,
  input: QueryCommandInput,
  partition: { attribute: string; value: string },
  map: (item: Item) => T,
  page: PageRequest = {},
): Promise<Page<T>> {
  const limit = Math.min(Math.max(page.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  let startKey: Record<string, unknown> | undefined = decodeCursor(page.cursor, partition);
  const items: T[] = [];
  let rounds = 0;

  do {
    const result = await doc.send(
      new QueryCommand({ ...input, ExclusiveStartKey: startKey, Limit: limit - items.length }),
    );
    for (const item of result.Items ?? []) items.push(map(item));
    startKey = result.LastEvaluatedKey;
    rounds += 1;
  } while (
    startKey &&
    input.FilterExpression &&
    items.length < limit &&
    rounds < MAX_FILTER_ROUND_TRIPS
  );

  return { items, nextCursor: encodeCursor(startKey) };
}

/** Reads every item a query matches. Only used for bounded sets (one account's sites, users, numbers). */
export async function queryAll(
  doc: DynamoDBDocumentClient,
  input: QueryCommandInput,
): Promise<Item[]> {
  const items: Item[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
    items.push(...(result.Items ?? []));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

/** Counts the items a query matches without returning them. */
export async function queryCount(
  doc: DynamoDBDocumentClient,
  input: QueryCommandInput,
): Promise<number> {
  let count = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(
      new QueryCommand({ ...input, Select: 'COUNT', ExclusiveStartKey: startKey }),
    );
    count += result.Count ?? 0;
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return count;
}
