import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { VoiceUser } from '@provisioning/contracts';
import { indexKeys, keys, prefixes } from './keys';
import { toUser, toUserRecord, type UserRecord } from './items';
import { QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { decodeCursor, encodeCursor } from './cursor';
import { createUserMatcher } from './user-search';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  queryAll,
  queryPage,
  type Page,
  type PageRequest,
} from './query';

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
    options: PageRequest & { siteId?: string | undefined; q?: string | undefined } = {},
  ): Promise<Page<VoiceUser>> {
    const { siteId, q, ...page } = options;
    const [index, attribute, pk] = siteId
      ? (['GSI2', 'GSI2PK', indexKeys.siteUsers(siteId)] as const)
      : (['GSI1', 'GSI1PK', indexKeys.accountUsers(accountId)] as const);
    const input = {
      TableName: this.tableName,
      IndexName: index,
      KeyConditionExpression: `${attribute} = :pk`,
      // Site ids are globally unique, but the account check keeps a guessed
      // site id from reading another account's users.
      FilterExpression: siteId ? 'accountId = :accountId' : undefined,
      ExpressionAttributeValues: siteId ? { ':pk': pk, ':accountId': accountId } : { ':pk': pk },
    };
    const term = q?.trim();
    if (term) {
      return this.search(input, { attribute, value: pk }, index, createUserMatcher(term), page);
    }
    return queryPage(this.doc, input, { attribute, value: pk }, toUser, page);
  }

  /**
   * Text filter. Matching is "contains" over several fields and digit-insensitive
   * for phone numbers, which a DynamoDB FilterExpression cannot express, and a
   * FilterExpression with Limit would return short or empty pages anyway. A
   * partition is one account's (or site's) users, a bounded set, so we read the
   * index in order in chunks, match in the service, and stop as soon as the page
   * is full. The cursor is the key of the last user returned (not the last one
   * read), so the next page resumes exactly after it and no match is skipped.
   * A short page therefore only happens at the end of the partition.
   */
  private async search(
    input: Omit<QueryCommandInput, 'Limit' | 'ExclusiveStartKey'>,
    partition: { attribute: string; value: string },
    index: 'GSI1' | 'GSI2',
    matches: (user: VoiceUser) => boolean,
    page: PageRequest,
  ): Promise<Page<VoiceUser>> {
    const limit = Math.min(Math.max(page.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const sortAttribute = index === 'GSI1' ? 'GSI1SK' : 'GSI2SK';
    let startKey: Record<string, unknown> | undefined = decodeCursor(page.cursor, partition);
    const items: VoiceUser[] = [];

    do {
      const result = await this.doc.send(
        new QueryCommand({ ...input, ExclusiveStartKey: startKey, Limit: MAX_PAGE_SIZE }),
      );
      const chunk = result.Items ?? [];
      for (const [i, item] of chunk.entries()) {
        const user = toUser(item);
        if (!matches(user)) continue;
        items.push(user);
        if (items.length < limit) continue;
        // Page is full. There may be more only if this chunk has unread rows
        // or the partition has another chunk.
        const hasMore = i < chunk.length - 1 || result.LastEvaluatedKey !== undefined;
        const last = {
          PK: item.PK,
          SK: item.SK,
          [partition.attribute]: item[partition.attribute],
          [sortAttribute]: item[sortAttribute],
        };
        return { items, nextCursor: hasMore ? encodeCursor(last) : null };
      }
      startKey = result.LastEvaluatedKey;
    } while (startKey);

    return { items, nextCursor: null };
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
