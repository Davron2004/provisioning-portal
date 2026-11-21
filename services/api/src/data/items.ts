import {
  Account,
  Order,
  OrderSummary,
  PhoneNumber,
  Site,
  VoiceUser,
  type OrderStatus,
} from '@provisioning/contracts';
import { indexKeys, keys, nameSortKey } from './keys';
import { Entity } from './table';

/**
 * Items are the contract objects plus key attributes, so a stream image or a
 * GetItem result maps back to the API shape with a schema parse (which also
 * strips the key attributes).
 */

/** A user as stored: the API shape plus the in-flight order lock. */
export type UserRecord = VoiceUser & {
  /** Set while an order is changing or removing this user. */
  pendingOrderId: string | null;
};

/** An order as stored: the API shape plus an optimistic-locking version. */
export type OrderRecord = Order & { version: number };

export type Item = Record<string, unknown>;

export const accountItem = (account: Account): Item => ({
  ...keys.account(account.id),
  entity: Entity.Account,
  GSI1PK: indexKeys.allAccounts(),
  GSI1SK: nameSortKey(account.name, account.id),
  ...account,
});

export const siteItem = (site: Site): Item => ({
  ...keys.site(site.accountId, site.id),
  entity: Entity.Site,
  ...site,
});

export const userItem = (user: UserRecord): Item => {
  const nameKey = nameSortKey(user.lastName, user.firstName, user.id);
  return {
    ...keys.user(user.accountId, user.id),
    entity: Entity.User,
    GSI1PK: indexKeys.accountUsers(user.accountId),
    GSI1SK: nameKey,
    GSI2PK: indexKeys.siteUsers(user.siteId),
    GSI2SK: nameKey,
    ...user,
  };
};

/** GSI keys that change with a number's status; repositories set them on every status change. */
export const numberIndexAttributes = (
  n: Pick<PhoneNumber, 'accountId' | 'siteId' | 'e164'>,
  status: string,
) => ({
  GSI1PK: indexKeys.accountNumbers(n.accountId),
  GSI1SK: `${status}#${n.e164}`,
  GSI2PK: indexKeys.siteNumbers(n.siteId),
  GSI2SK: `${status}#${n.e164}`,
});

export const numberItem = (n: PhoneNumber): Item => ({
  ...keys.number(n.accountId, n.e164),
  entity: Entity.Number,
  ...numberIndexAttributes(n, n.status),
  ...n,
});

export const orderIndexAttributes = (orderId: string, status: OrderStatus) => ({
  GSI1PK: indexKeys.allOrders(),
  GSI1SK: orderId,
  GSI2PK: indexKeys.ordersByStatus(status),
  GSI2SK: orderId,
});

export const orderItem = (order: OrderRecord): Item => ({
  ...keys.order(order.accountId, order.id),
  entity: Entity.Order,
  ...orderIndexAttributes(order.id, order.status),
  ...order,
});

export type GuardKind = 'email' | 'extension' | 'mac';

export const guardItem = (
  kind: GuardKind,
  value: string,
  owner: { accountId: string; userId: string },
): Item => {
  const key =
    kind === 'email'
      ? keys.emailGuard(owner.accountId, value)
      : kind === 'extension'
        ? keys.extensionGuard(owner.accountId, value)
        : keys.macGuard(value);
  return { ...key, entity: Entity.Guard, kind, value, ...owner };
};

/** The guard items that must exist for a user: email, extension and (if any) device MAC. */
export const userGuardItems = (user: VoiceUser): Item[] => {
  const owner = { accountId: user.accountId, userId: user.id };
  const guards = [
    guardItem('email', user.email, owner),
    guardItem('extension', user.extension, owner),
  ];
  if (user.device?.macAddress) guards.push(guardItem('mac', user.device.macAddress, owner));
  return guards;
};

// ---------------------------------------------------------------------------
// Item -> domain
// ---------------------------------------------------------------------------

export const toAccount = (item: Item): Account => Account.parse(item);
export const toSite = (item: Item): Site => Site.parse(item);
export const toPhoneNumber = (item: Item): PhoneNumber => PhoneNumber.parse(item);

export const toUserRecord = (item: Item): UserRecord => ({
  ...VoiceUser.parse(item),
  pendingOrderId: typeof item.pendingOrderId === 'string' ? item.pendingOrderId : null,
});

export const toUser = (item: Item): VoiceUser => VoiceUser.parse(item);

export const toOrderRecord = (item: Item): OrderRecord => ({
  ...Order.parse(item),
  version: typeof item.version === 'number' ? item.version : 0,
});

export const toOrder = (item: Item): Order => Order.parse(item);

export const toOrderSummary = (item: Item): OrderSummary => OrderSummary.parse(item);
