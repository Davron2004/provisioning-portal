import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ALL_ACCOUNTS } from '@provisioning/contracts';
import { indexKeys, keys } from './keys';
import { queryAll } from './query';
import { Entity } from './table';

/**
 * WebSocket connections and their account subscriptions. Items expire via
 * TTL a little after API Gateway's two-hour connection limit, so a missed
 * $disconnect never leaves them behind for long; the notifier also deletes a
 * connection as soon as API Gateway reports it gone.
 */
export const CONNECTION_TTL_SECONDS = 2 * 60 * 60 + 10 * 60;

export class ConnectionsRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async add(connectionId: string, user: { email: string }, now: Date): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.connection(connectionId),
          entity: Entity.Connection,
          connectionId,
          userEmail: user.email,
          connectedAt: now.toISOString(),
          expiresAt: expiry(now),
        },
      }),
    );
  }

  /** Subscribes to one account's order updates, or every account with "*". */
  async subscribe(connectionId: string, accountId: string, now: Date): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          ...keys.subscription(connectionId, accountId),
          entity: Entity.Subscription,
          GSI1PK: indexKeys.subscribers(accountId),
          GSI1SK: connectionId,
          connectionId,
          accountId,
          expiresAt: expiry(now),
        },
      }),
    );
  }

  async unsubscribe(connectionId: string, accountId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: keys.subscription(connectionId, accountId),
      }),
    );
  }

  /** Deletes a connection and all of its subscriptions. */
  async remove(connectionId: string): Promise<void> {
    const items = await queryAll(this.doc, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': keys.connection(connectionId).PK },
      ProjectionExpression: 'PK, SK',
    });
    for (let i = 0; i < items.length; i += 25) {
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: items
              .slice(i, i + 25)
              .map((item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } })),
          },
        }),
      );
    }
  }

  /** Connections that should hear about an account: its own subscribers plus "*" subscribers. */
  async subscribersOf(accountId: string): Promise<string[]> {
    const scopes = accountId === ALL_ACCOUNTS ? [ALL_ACCOUNTS] : [accountId, ALL_ACCOUNTS];
    const results = await Promise.all(
      scopes.map((scope) =>
        queryAll(this.doc, {
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': indexKeys.subscribers(scope) },
          ProjectionExpression: 'connectionId',
        }),
      ),
    );
    return [...new Set(results.flat().map((item) => String(item.connectionId)))];
  }
}

const expiry = (now: Date) => Math.floor(now.getTime() / 1000) + CONNECTION_TTL_SECONDS;
