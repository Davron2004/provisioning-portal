import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

/**
 * Single-table design. Every item has PK/SK plus an `entity` attribute; list
 * and filter access patterns go through two overloaded GSIs. See
 * docs/detailed-design.md ("Data model and access patterns") for the full
 * access-pattern table. CDK mirrors TABLE_DEFINITION; the local harness and
 * the integration tests create the table from `createTableInput`.
 */
export const TABLE_DEFINITION = {
  partitionKey: 'PK',
  sortKey: 'SK',
  globalSecondaryIndexes: [
    { indexName: 'GSI1', partitionKey: 'GSI1PK', sortKey: 'GSI1SK' },
    { indexName: 'GSI2', partitionKey: 'GSI2PK', sortKey: 'GSI2SK' },
  ],
  /** Epoch seconds. Set on WebSocket connections, subscriptions and idempotency records. */
  timeToLiveAttribute: 'expiresAt',
  billingMode: 'PAY_PER_REQUEST',
  streamViewType: 'NEW_AND_OLD_IMAGES',
} as const;

export type IndexName = (typeof TABLE_DEFINITION.globalSecondaryIndexes)[number]['indexName'];

export const Entity = {
  Account: 'Account',
  Site: 'Site',
  User: 'User',
  Number: 'Number',
  Order: 'Order',
  /** Uniqueness guard for an email, extension or MAC address. */
  Guard: 'Guard',
  Idempotency: 'Idempotency',
  Connection: 'Connection',
  Subscription: 'Subscription',
} as const;
export type Entity = (typeof Entity)[keyof typeof Entity];

export function createTableInput(tableName: string): CreateTableCommandInput {
  const { partitionKey, sortKey, globalSecondaryIndexes } = TABLE_DEFINITION;
  const attributes = [
    partitionKey,
    sortKey,
    ...globalSecondaryIndexes.flatMap((gsi) => [gsi.partitionKey, gsi.sortKey]),
  ];
  return {
    TableName: tableName,
    BillingMode: TABLE_DEFINITION.billingMode,
    AttributeDefinitions: attributes.map((name) => ({ AttributeName: name, AttributeType: 'S' })),
    KeySchema: [
      { AttributeName: partitionKey, KeyType: 'HASH' },
      { AttributeName: sortKey, KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: globalSecondaryIndexes.map((gsi) => ({
      IndexName: gsi.indexName,
      KeySchema: [
        { AttributeName: gsi.partitionKey, KeyType: 'HASH' },
        { AttributeName: gsi.sortKey, KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    })),
    StreamSpecification: { StreamEnabled: true, StreamViewType: TABLE_DEFINITION.streamViewType },
  };
}
