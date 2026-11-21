import { BatchWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  accountItem,
  numberItem,
  orderItem,
  siteItem,
  userGuardItems,
  userItem,
  type Item,
} from '../../data/items';
import type { SeedData } from './generate';

/** Every table item for the seed, including the uniqueness guards a real write would create. */
export function seedItems(data: SeedData): Item[] {
  return [
    ...data.accounts.map(accountItem),
    ...data.sites.map(siteItem),
    ...data.users.flatMap((u) => [userItem(u), ...userGuardItems(u)]),
    ...data.numbers.map(numberItem),
    ...data.orders.map(orderItem),
  ];
}

const BATCH_SIZE = 25;
const CONCURRENT_BATCHES = 4;

export async function writeItems(
  doc: DynamoDBDocumentClient,
  tableName: string,
  items: Item[],
): Promise<void> {
  const batches: Item[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) await writeBatch(doc, tableName, batches[next++]!);
  };
  await Promise.all(Array.from({ length: CONCURRENT_BATCHES }, worker));
}

async function writeBatch(doc: DynamoDBDocumentClient, tableName: string, batch: Item[]) {
  let requests = batch.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; requests.length > 0; attempt++) {
    if (attempt > 8) throw new Error('DynamoDB kept returning unprocessed items while seeding');
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
    const result = await doc.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: requests } }),
    );
    requests = (result.UnprocessedItems?.[tableName] ?? []) as typeof requests;
  }
}
