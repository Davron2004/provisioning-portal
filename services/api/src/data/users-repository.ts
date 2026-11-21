import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { VoiceUser } from '@provisioning/contracts';
import { indexKeys, keys, prefixes } from './keys';
import { toUser, toUserRecord, type UserRecord } from './items';
import { queryAll, queryPage, type Page, type PageRequest } from './query';

export class UsersRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get(accountId: string, userId: string): Promise<UserRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.user(accountId, userId),
        ConsistentRead: true,
      }),
    );
    return Item ? toUserRecord(Item) : null;
  }

  /** Users in last-name order, for the whole account (GSI1) or one site (GSI2). */
  list(
    accountId: string,
    options: PageRequest & { siteId?: string | undefined } = {},
  ): Promise<Page<VoiceUser>> {
    const { siteId, ...page } = options;
    const [index, attribute, pk] = siteId
      ? (['GSI2', 'GSI2PK', indexKeys.siteUsers(siteId)] as const)
      : (['GSI1', 'GSI1PK', indexKeys.accountUsers(accountId)] as const);
    return queryPage(
      this.doc,
      {
        TableName: this.tableName,
        IndexName: index,
        KeyConditionExpression: `${attribute} = :pk`,
        // Site ids are globally unique, but the account check keeps a guessed
        // site id from reading another account's users.
        FilterExpression: siteId ? 'accountId = :accountId' : undefined,
        ExpressionAttributeValues: siteId ? { ':pk': pk, ':accountId': accountId } : { ':pk': pk },
      },
      { attribute, value: pk },
      toUser,
      page,
    );
  }

  /** Every user of an account, with lock state. Used to build the validation context. */
  async listAll(accountId: string): Promise<UserRecord[]> {
    const items = await queryAll(this.doc, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': keys.account(accountId).PK, ':prefix': prefixes.user },
      ConsistentRead: true,
    });
    return items.map(toUserRecord);
  }
}
