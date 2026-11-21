import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { NumberStatus, PhoneNumber } from '@provisioning/contracts';
import { indexKeys, keys, prefixes } from './keys';
import { toPhoneNumber } from './items';
import { queryAll, queryPage, type Page, type PageRequest } from './query';

export interface NumberFilter extends PageRequest {
  siteId?: string | undefined;
  status?: NumberStatus | undefined;
}

export class NumbersRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get(accountId: string, e164: string): Promise<PhoneNumber | null> {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.number(accountId, e164),
        ConsistentRead: true,
      }),
    );
    return Item ? toPhoneNumber(Item) : null;
  }

  /**
   * Numbers in E.164 order (no filter, base table) or grouped by status then
   * E.164 (status and/or site filter, via GSI1/GSI2 whose sort key is
   * `<status>#<e164>`).
   */
  list(accountId: string, filter: NumberFilter = {}): Promise<Page<PhoneNumber>> {
    const { siteId, status, ...page } = filter;
    if (!siteId && !status) {
      const pk = keys.account(accountId).PK;
      return queryPage(
        this.doc,
        {
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefixes.number },
        },
        { attribute: 'PK', value: pk },
        toPhoneNumber,
        page,
      );
    }
    const [index, pkAttr, skAttr, pk] = siteId
      ? (['GSI2', 'GSI2PK', 'GSI2SK', indexKeys.siteNumbers(siteId)] as const)
      : (['GSI1', 'GSI1PK', 'GSI1SK', indexKeys.accountNumbers(accountId)] as const);
    const values: Record<string, string> = { ':pk': pk };
    let condition = `${pkAttr} = :pk`;
    if (status) {
      condition += ` AND begins_with(${skAttr}, :status)`;
      values[':status'] = `${status}#`;
    }
    if (siteId) values[':accountId'] = accountId;
    return queryPage(
      this.doc,
      {
        TableName: this.tableName,
        IndexName: index,
        KeyConditionExpression: condition,
        FilterExpression: siteId ? 'accountId = :accountId' : undefined,
        ExpressionAttributeValues: values,
      },
      { attribute: pkAttr, value: pk },
      toPhoneNumber,
      page,
    );
  }

  /** Every number of an account. Used to build the validation context. */
  async listAll(accountId: string): Promise<PhoneNumber[]> {
    const items = await queryAll(this.doc, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': keys.account(accountId).PK, ':prefix': prefixes.number },
      ConsistentRead: true,
    });
    return items.map(toPhoneNumber);
  }
}
