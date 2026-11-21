import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Account, Site } from '@provisioning/contracts';
import { indexKeys, keys, prefixes } from './keys';
import { toAccount, toSite } from './items';
import { queryAll, queryPage, type Page, type PageRequest } from './query';

export class AccountsRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get(accountId: string): Promise<Account | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: keys.account(accountId) }),
    );
    return Item ? toAccount(Item) : null;
  }

  /** Accounts in name order. */
  list(page?: PageRequest): Promise<Page<Account>> {
    const pk = indexKeys.allAccounts();
    return queryPage(
      this.doc,
      {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
      },
      { attribute: 'GSI1PK', value: pk },
      toAccount,
      page,
    );
  }

  async listAll(): Promise<Account[]> {
    const items = await queryAll(this.doc, {
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': indexKeys.allAccounts() },
    });
    return items.map(toAccount);
  }

  async getSite(accountId: string, siteId: string): Promise<Site | null> {
    const { Item } = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: keys.site(accountId, siteId) }),
    );
    return Item ? toSite(Item) : null;
  }

  /** An account's sites in name order. Accounts have a handful of sites, so this is one query. */
  async listSites(accountId: string): Promise<Site[]> {
    const items = await queryAll(this.doc, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': keys.account(accountId).PK, ':prefix': prefixes.site },
    });
    return items.map(toSite).sort((a, b) => a.name.localeCompare(b.name, 'en-CA'));
  }
}
