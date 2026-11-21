import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { UserSnapshot } from '@provisioning/contracts';
import { guardItem, numberIndexAttributes, userItem, type UserRecord } from './items';
import { keys } from './keys';
import { transactWrite, type GuardedWrite } from './transactions';

/**
 * The writes that make an order real. Each method is one DynamoDB
 * transaction, so a user, its uniqueness guards, its number and the account
 * and site counters always change together.
 *
 *   claim*   (ValidateOrder)  take the resources a line needs, or fail with a
 *                             WriteConflictError naming what was taken
 *   commit*  (ProvisionLine)  apply the change once provisioning succeeded
 *   release  (on failure)     mark the user failed and let go of the lock
 */
export class ProvisioningRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /** Current owners of the given MAC addresses (any account). */
  async macOwners(macs: string[]): Promise<Map<string, { accountId: string; userId: string }>> {
    const owners = new Map<string, { accountId: string; userId: string }>();
    for (let i = 0; i < macs.length; i += 100) {
      const chunk = macs.slice(i, i + 100);
      let request: Record<string, unknown>[] | undefined = chunk.map((mac) => ({
        ...keys.macGuard(mac),
      }));
      while (request && request.length > 0) {
        const result: BatchGetCommandOutput = await this.doc.send(
          new BatchGetCommand({
            RequestItems: { [this.tableName]: { Keys: request, ConsistentRead: true } },
          }),
        );
        for (const item of result.Responses?.[this.tableName] ?? []) {
          owners.set(String(item.value), {
            accountId: String(item.accountId),
            userId: String(item.userId),
          });
        }
        request = result.UnprocessedKeys?.[this.tableName]?.Keys;
      }
    }
    return owners;
  }

  /** Creates a user in `provisioning` state and takes its email, extension, number and MAC. */
  async claimNewUser(user: UserRecord, orderId: string, now: Date): Promise<void> {
    const at = now.toISOString();
    const owner = { accountId: user.accountId, userId: user.id };
    const writes: GuardedWrite[] = [
      this.put(userItem(user), `User ${user.id} already exists`),
      this.put(guardItem('email', user.email, owner), `${user.email} is already in use`),
      this.put(
        guardItem('extension', user.extension, owner),
        `Extension ${user.extension} is already in use`,
      ),
    ];
    if (user.did) {
      writes.push({
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.number(user.accountId, user.did),
            UpdateExpression:
              'SET #status = :reserved, userId = :userId, orderId = :orderId, updatedAt = :at, GSI1SK = :gsi1sk, GSI2SK = :gsi2sk',
            ConditionExpression: '#status = :available AND siteId = :siteId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':reserved': 'reserved',
              ':available': 'available',
              ':userId': user.id,
              ':orderId': orderId,
              ':siteId': user.siteId,
              ':at': at,
              ...this.numberSortKeys(user, 'reserved'),
            },
          },
        },
        conflict: `${user.did} is no longer available`,
      });
    }
    if (user.device?.macAddress) {
      writes.push(
        this.put(
          guardItem('mac', user.device.macAddress, owner),
          `MAC ${user.device.macAddress} is already registered to another phone`,
        ),
      );
    }
    writes.push(...this.counters(user, { users: 1, numbers: user.did ? 1 : 0 }, at));
    await transactWrite(this.doc, writes);
  }

  /**
   * Locks an existing user for this order (update, remove, or the retry of a
   * failed add). Optionally takes a new MAC address in the same transaction.
   */
  async claimExistingUser(
    user: Pick<UserRecord, 'accountId' | 'id' | 'firstName' | 'lastName'>,
    orderId: string,
    status: 'provisioning' | 'removing',
    now: Date,
    newMac?: string | null,
  ): Promise<void> {
    const name = `${user.firstName} ${user.lastName}`;
    const writes: GuardedWrite[] = [
      {
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.user(user.accountId, user.id),
            UpdateExpression:
              'SET #status = :status, pendingOrderId = :orderId, lastOrderId = :orderId, updatedAt = :at',
            ConditionExpression:
              'attribute_exists(PK) AND (attribute_not_exists(pendingOrderId) OR pendingOrderId = :orderId)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': status,
              ':orderId': orderId,
              ':at': now.toISOString(),
            },
          },
        },
        conflict: `${name} no longer exists or is being changed by another order`,
      },
    ];
    if (newMac) {
      writes.push({
        item: {
          Put: {
            TableName: this.tableName,
            Item: guardItem('mac', newMac, { accountId: user.accountId, userId: user.id }),
            ConditionExpression: 'attribute_not_exists(PK) OR userId = :userId',
            ExpressionAttributeValues: { ':userId': user.id },
          },
        },
        conflict: `MAC ${newMac} is already registered to another phone`,
      });
    }
    await transactWrite(this.doc, writes);
  }

  /** A new user's line succeeded: the user goes live and the number moves to `assigned`. */
  async commitNewUser(user: UserRecord, orderId: string, now: Date): Promise<void> {
    const at = now.toISOString();
    const writes: GuardedWrite[] = [this.activateUser(user, orderId, at)];
    if (user.did) {
      writes.push({
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.number(user.accountId, user.did),
            UpdateExpression:
              'SET #status = :assigned, orderId = :none, updatedAt = :at, GSI1SK = :gsi1sk, GSI2SK = :gsi2sk',
            ConditionExpression: 'orderId = :orderId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':assigned': 'assigned',
              ':none': null,
              ':orderId': orderId,
              ':at': at,
              ...this.numberSortKeys(user, 'assigned'),
            },
          },
        },
        conflict: `${user.did} is no longer reserved for this order`,
      });
    }
    await transactWrite(this.doc, writes);
  }

  /** An update line succeeded: apply voicemail and device, and swap the MAC guard if it changed. */
  async commitUpdate(
    user: UserRecord,
    after: UserSnapshot,
    orderId: string,
    now: Date,
  ): Promise<void> {
    const at = now.toISOString();
    const device = after.deviceModel
      ? { model: after.deviceModel, macAddress: after.macAddress }
      : null;
    const writes: GuardedWrite[] = [
      {
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.user(user.accountId, user.id),
            UpdateExpression:
              'SET #status = :active, voicemail = :voicemail, device = :device, updatedAt = :at REMOVE pendingOrderId',
            ConditionExpression: 'pendingOrderId = :orderId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':active': 'active',
              ':voicemail': after.voicemail,
              ':device': device,
              ':orderId': orderId,
              ':at': at,
            },
          },
        },
        conflict: 'The user is no longer locked by this order',
      },
    ];
    const oldMac = user.device?.macAddress ?? null;
    if (oldMac && oldMac !== after.macAddress) writes.push(this.deleteMacGuard(oldMac, user.id));
    await transactWrite(this.doc, writes);
  }

  /** A remove line succeeded: delete the user and its guards, return the number to the pool. */
  async commitRemoval(user: UserRecord, orderId: string, now: Date): Promise<void> {
    const at = now.toISOString();
    const writes: GuardedWrite[] = [
      {
        item: {
          Delete: {
            TableName: this.tableName,
            Key: keys.user(user.accountId, user.id),
            ConditionExpression: 'pendingOrderId = :orderId',
            ExpressionAttributeValues: { ':orderId': orderId },
          },
        },
        conflict: 'The user is no longer locked by this order',
      },
      {
        item: {
          Delete: { TableName: this.tableName, Key: keys.emailGuard(user.accountId, user.email) },
        },
      },
      {
        item: {
          Delete: {
            TableName: this.tableName,
            Key: keys.extensionGuard(user.accountId, user.extension),
          },
        },
      },
    ];
    if (user.device?.macAddress) writes.push(this.deleteMacGuard(user.device.macAddress, user.id));
    if (user.did) {
      writes.push({
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.number(user.accountId, user.did),
            UpdateExpression:
              'SET #status = :available, userId = :none, orderId = :none, updatedAt = :at, GSI1SK = :gsi1sk, GSI2SK = :gsi2sk',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':available': 'available',
              ':none': null,
              ':at': at,
              ...this.numberSortKeys(user, 'available'),
            },
          },
        },
      });
    }
    writes.push(...this.counters(user, { users: -1, numbers: user.did ? -1 : 0 }, at));
    await transactWrite(this.doc, writes);
  }

  /**
   * A line failed for good: the user is marked `failed` and unlocked so it
   * can be fixed by a retry or another order. A failed add keeps its
   * reserved number until then; a new MAC claimed for an update is released.
   */
  async releaseFailedUser(
    user: Pick<UserRecord, 'accountId' | 'id'>,
    orderId: string,
    now: Date,
    releaseMac?: string | null,
  ): Promise<void> {
    const writes: GuardedWrite[] = [
      {
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.user(user.accountId, user.id),
            UpdateExpression: 'SET #status = :failed, updatedAt = :at REMOVE pendingOrderId',
            ConditionExpression: 'pendingOrderId = :orderId',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':failed': 'failed',
              ':orderId': orderId,
              ':at': now.toISOString(),
            },
          },
        },
        conflict: 'The user is no longer locked by this order',
      },
    ];
    if (releaseMac) writes.push(this.deleteMacGuard(releaseMac, user.id));
    await transactWrite(this.doc, writes);
  }

  // -------------------------------------------------------------------------

  private put(item: Record<string, unknown>, conflict: string): GuardedWrite {
    return {
      item: {
        Put: {
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      conflict,
    };
  }

  private activateUser(user: UserRecord, orderId: string, at: string): GuardedWrite {
    return {
      item: {
        Update: {
          TableName: this.tableName,
          Key: keys.user(user.accountId, user.id),
          UpdateExpression: 'SET #status = :active, updatedAt = :at REMOVE pendingOrderId',
          ConditionExpression: 'pendingOrderId = :orderId',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':active': 'active', ':orderId': orderId, ':at': at },
        },
      },
      conflict: 'The user is no longer locked by this order',
    };
  }

  private deleteMacGuard(mac: string, userId: string): GuardedWrite {
    return {
      item: {
        Delete: {
          TableName: this.tableName,
          Key: keys.macGuard(mac),
          ConditionExpression: 'attribute_not_exists(PK) OR userId = :userId',
          ExpressionAttributeValues: { ':userId': userId },
        },
      },
      conflict: `MAC ${mac} belongs to another user`,
    };
  }

  private numberSortKeys(user: Pick<UserRecord, 'accountId' | 'siteId' | 'did'>, status: string) {
    const attrs = numberIndexAttributes(
      { accountId: user.accountId, siteId: user.siteId, e164: user.did! },
      status,
    );
    return { ':gsi1sk': attrs.GSI1SK, ':gsi2sk': attrs.GSI2SK };
  }

  /** Account and site counters move in the same transaction as the user and number. */
  private counters(
    user: Pick<UserRecord, 'accountId' | 'siteId'>,
    delta: { users: number; numbers: number },
    at: string,
  ): GuardedWrite[] {
    return [
      {
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.account(user.accountId),
            UpdateExpression: 'ADD userCount :users, numbersAssigned :numbers SET updatedAt = :at',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: {
              ':users': delta.users,
              ':numbers': delta.numbers,
              ':at': at,
            },
          },
        },
        conflict: `Account ${user.accountId} no longer exists`,
      },
      {
        item: {
          Update: {
            TableName: this.tableName,
            Key: keys.site(user.accountId, user.siteId),
            UpdateExpression: 'ADD userCount :users, numbersAvailable :available',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':users': delta.users, ':available': -delta.numbers },
          },
        },
        conflict: `Site ${user.siteId} no longer exists`,
      },
    ];
  }
}
