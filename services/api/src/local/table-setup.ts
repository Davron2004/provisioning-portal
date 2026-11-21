import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { createTableInput } from '../data/table';

async function tableExists(client: DynamoDBClient, tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return false;
    throw error;
  }
}

async function waitForActive(client: DynamoDBClient, tableName: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (Table?.TableStatus === 'ACTIVE') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Table ${tableName} did not become ACTIVE`);
}

/** Creates the table (dropping it first when `reset`). Returns true when a new table was created. */
export async function ensureTable(
  client: DynamoDBClient,
  tableName: string,
  options: { reset?: boolean } = {},
): Promise<boolean> {
  const exists = await tableExists(client, tableName);
  if (exists && !options.reset) return false;
  if (exists) await client.send(new DeleteTableCommand({ TableName: tableName }));
  await client.send(new CreateTableCommand(createTableInput(tableName)));
  await waitForActive(client, tableName);
  return true;
}

export async function dropTable(client: DynamoDBClient, tableName: string): Promise<void> {
  if (await tableExists(client, tableName)) {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  }
}
