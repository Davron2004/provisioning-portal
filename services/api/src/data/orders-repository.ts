import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { OrderStatus, type OrderSummary } from '@provisioning/contracts';
import { indexKeys, keys, prefixes } from './keys';
import { toOrderRecord, toOrderSummary, type OrderRecord } from './items';
import { queryCount, queryPage, type Page, type PageRequest } from './query';

export interface OrderFilter extends PageRequest {
  status?: OrderStatus | undefined;
}

export class OrdersRepository {
  constructor(
    protected readonly doc: DynamoDBDocumentClient,
    protected readonly tableName: string,
  ) {}

  async get(accountId: string, orderId: string): Promise<OrderRecord | null> {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.order(accountId, orderId),
        ConsistentRead: true,
      }),
    );
    return Item ? toOrderRecord(Item) : null;
  }

  /**
   * One account's orders, newest first (order ids are ULIDs, so SK order is
   * creation order). The status filter is a FilterExpression: an account has
   * a bounded number of orders, so this avoids a third GSI.
   */
  listForAccount(accountId: string, filter: OrderFilter = {}): Promise<Page<OrderSummary>> {
    const { status, ...page } = filter;
    const pk = keys.account(accountId).PK;
    return queryPage(
      this.doc,
      {
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: status ? '#status = :status' : undefined,
        ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
        ExpressionAttributeValues: {
          ':pk': pk,
          ':prefix': prefixes.order,
          ...(status ? { ':status': status } : {}),
        },
        ScanIndexForward: false,
      },
      { attribute: 'PK', value: pk },
      toOrderSummary,
      page,
    );
  }

  /** Orders across all accounts, newest first (GSI1), or with one status (GSI2). */
  listAll(filter: OrderFilter = {}): Promise<Page<OrderSummary>> {
    const { status, ...page } = filter;
    const [index, attribute, pk] = status
      ? (['GSI2', 'GSI2PK', indexKeys.ordersByStatus(status)] as const)
      : (['GSI1', 'GSI1PK', indexKeys.allOrders()] as const);
    return queryPage(
      this.doc,
      {
        TableName: this.tableName,
        IndexName: index,
        KeyConditionExpression: `${attribute} = :pk`,
        ExpressionAttributeValues: { ':pk': pk },
        ScanIndexForward: false,
      },
      { attribute, value: pk },
      toOrderSummary,
      page,
    );
  }

  /** Order counts per status, one COUNT query per status partition of GSI2. */
  async countByStatus(): Promise<Record<OrderStatus, number>> {
    const counts = await Promise.all(
      OrderStatus.options.map(
        async (status) =>
          [
            status,
            await queryCount(this.doc, {
              TableName: this.tableName,
              IndexName: 'GSI2',
              KeyConditionExpression: 'GSI2PK = :pk',
              ExpressionAttributeValues: { ':pk': indexKeys.ordersByStatus(status) },
            }),
          ] as const,
      ),
    );
    return Object.fromEntries(counts) as Record<OrderStatus, number>;
  }
}
