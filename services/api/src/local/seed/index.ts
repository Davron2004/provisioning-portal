import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { indexKeys } from '../../data/keys';
import { generateSeed, type SeedData } from './generate';
import { seedItems, writeItems } from './write';

export async function isTableEmpty(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<boolean> {
  const { Count } = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': indexKeys.allAccounts() },
      Limit: 1,
      Select: 'COUNT',
    }),
  );
  return (Count ?? 0) === 0;
}

export async function seedDatabase(
  doc: DynamoDBDocumentClient,
  tableName: string,
  now = new Date(),
): Promise<SeedData> {
  const data = generateSeed(now);
  await writeItems(doc, tableName, seedItems(data));
  return data;
}
