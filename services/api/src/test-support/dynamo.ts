import { randomUUID } from 'node:crypto';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDocumentClient } from '../data/client';
import { dropTable, ensureTable } from '../local/table-setup';

/**
 * A throwaway table on DynamoDB Local for one integration test file, so test
 * files can run in parallel without seeing each other's data.
 */
export interface TestTable {
  doc: DynamoDBDocumentClient;
  tableName: string;
  drop: () => Promise<void>;
}

export const dynamoEndpoint = () =>
  process.env.DYNAMODB_ENDPOINT ?? `http://localhost:${process.env.DDB_PORT ?? 8000}`;

export async function createTestTable(): Promise<TestTable> {
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
  const doc = createDocumentClient({ endpoint: dynamoEndpoint(), region: 'ca-central-1' });
  const tableName = `test-${randomUUID()}`;
  await ensureTable(doc, tableName);
  return { doc, tableName, drop: () => dropTable(doc, tableName) };
}
