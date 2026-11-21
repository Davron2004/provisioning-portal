import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoConfig {
  /** Override for DynamoDB Local; unset in AWS. */
  endpoint?: string | undefined;
  region?: string | undefined;
}

export function createDocumentClient(config: DynamoConfig = {}): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.region ? { region: config.region } : {}),
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
  });
}

/** One client per Lambda execution environment, reused across invocations. */
let shared: DynamoDBDocumentClient | undefined;
export function sharedDocumentClient(): DynamoDBDocumentClient {
  shared ??= createDocumentClient({ endpoint: process.env.DYNAMODB_ENDPOINT });
  return shared;
}
