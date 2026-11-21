import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { OrderStatus, type Order, type OrderSummary } from '@provisioning/contracts';
import { ConflictError, NotFoundError } from '../errors';
import { indexKeys, keys, prefixes } from './keys';
import { orderItem, toOrderRecord, toOrderSummary, type OrderRecord } from './items';
import { queryCount, queryPage, type Page, type PageRequest } from './query';
import { transactWrite, WriteConflictError } from './transactions';
import { Entity } from './table';

/** How long a repeated POST with the same idempotency key returns the original order. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_MUTATE_ATTEMPTS = 10;

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

  /**
   * Stores a new order together with its idempotency record. A repeated key
   * returns the order created the first time; a repeated key with a
   * different request is a conflict.
   */
  async create(
    order: Order,
    idempotency: { key: string; requestHash: string },
    now: Date,
  ): Promise<{ order: OrderRecord; created: boolean }> {
    const record: OrderRecord = { ...order, version: 1 };
    try {
      await transactWrite(this.doc, [
        {
          item: {
            Put: {
              TableName: this.tableName,
              Item: orderItem(record),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          conflict: `Order ${order.id} already exists`,
        },
        {
          item: {
            Put: {
              TableName: this.tableName,
              Item: {
                ...keys.idempotency(order.accountId, idempotency.key),
                entity: Entity.Idempotency,
                orderId: order.id,
                requestHash: idempotency.requestHash,
                expiresAt: Math.floor(now.getTime() / 1000) + IDEMPOTENCY_TTL_SECONDS,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        },
      ]);
      return { order: record, created: true };
    } catch (error) {
      // Index 1 is the idempotency record: this key was seen before.
      if (!(error instanceof WriteConflictError) || error.index !== 1) throw error;
      const existing = await this.findByIdempotencyKey(order.accountId, idempotency.key);
      if (!existing) throw error;
      if (existing.requestHash !== idempotency.requestHash) {
        throw new ConflictError('This idempotency key was already used for a different order');
      }
      const original = await this.get(order.accountId, existing.orderId);
      if (!original) throw new NotFoundError(`Order ${existing.orderId} was not found`);
      return { order: original, created: false };
    }
  }

  async findByIdempotencyKey(
    accountId: string,
    key: string,
  ): Promise<{ orderId: string; requestHash: string } | null> {
    const { Item } = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: keys.idempotency(accountId, key),
        ConsistentRead: true,
      }),
    );
    // TTL deletion is lazy; treat an expired record as absent.
    if (!Item || (typeof Item.expiresAt === 'number' && Item.expiresAt * 1000 < Date.now())) {
      return null;
    }
    return { orderId: String(Item.orderId), requestHash: String(Item.requestHash) };
  }

  /**
   * Read-modify-write with optimistic locking. Several workflow tasks update
   * one order at the same time (up to MAP_MAX_CONCURRENCY lines), so `change`
   * runs against a fresh copy and the write only lands if `version` has not
   * moved; otherwise it is re-read and re-applied.
   */
  async mutate<T>(
    accountId: string,
    orderId: string,
    change: (order: Order) => T,
  ): Promise<{ order: OrderRecord; result: T }> {
    for (let attempt = 1; ; attempt++) {
      const current = await this.get(accountId, orderId);
      if (!current) throw new NotFoundError(`Order ${orderId} was not found`);
      const { version, ...order } = structuredClone(current);
      const result = change(order);
      const next: OrderRecord = { ...order, version: version + 1 };
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: orderItem(next),
            ConditionExpression: 'version = :version',
            ExpressionAttributeValues: { ':version': version },
          }),
        );
        return { order: next, result };
      } catch (error) {
        if (!(error instanceof ConditionalCheckFailedException) || attempt >= MAX_MUTATE_ATTEMPTS) {
          throw error;
        }
        await new Promise((r) => setTimeout(r, Math.random() * 25 * attempt));
      }
    }
  }
}
