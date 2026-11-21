/**
 * Key builders for every item type. Keeping them in one place is what makes
 * the single-table design readable: each function documents one access path.
 */

export interface PrimaryKey {
  PK: string;
  SK: string;
}

const accountPk = (accountId: string) => `ACCOUNT#${accountId}`;

/** Sort keys are case-insensitive so lists come back in natural name order. */
export const nameSortKey = (...parts: string[]) =>
  parts.map((p) => p.toLocaleLowerCase('en-CA')).join('#');

export const keys = {
  account: (accountId: string): PrimaryKey => ({ PK: accountPk(accountId), SK: 'ACCOUNT' }),
  site: (accountId: string, siteId: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `SITE#${siteId}`,
  }),
  user: (accountId: string, userId: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `USER#${userId}`,
  }),
  number: (accountId: string, e164: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `NUMBER#${e164}`,
  }),
  order: (accountId: string, orderId: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `ORDER#${orderId}`,
  }),
  /** Extensions are unique within an account (site ranges do not overlap). */
  extensionGuard: (accountId: string, extension: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `EXT#${extension}`,
  }),
  emailGuard: (accountId: string, email: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `EMAIL#${email.toLowerCase()}`,
  }),
  /** A physical device can only be registered once, across all accounts. */
  macGuard: (macAddress: string): PrimaryKey => ({ PK: `MAC#${macAddress}`, SK: 'MAC' }),
  idempotency: (accountId: string, key: string): PrimaryKey => ({
    PK: accountPk(accountId),
    SK: `IDEMPOTENCY#${key}`,
  }),
  connection: (connectionId: string): PrimaryKey => ({
    PK: `CONNECTION#${connectionId}`,
    SK: 'CONNECTION',
  }),
  subscription: (connectionId: string, accountId: string): PrimaryKey => ({
    PK: `CONNECTION#${connectionId}`,
    SK: `SUB#${accountId}`,
  }),
};

/** Sort-key prefixes for queries inside an account partition. */
export const prefixes = {
  site: 'SITE#',
  user: 'USER#',
  number: 'NUMBER#',
  order: 'ORDER#',
  subscription: 'SUB#',
} as const;

/** GSI partition keys. GSI1 lists things in a scope; GSI2 narrows by site or status. */
export const indexKeys = {
  allAccounts: () => 'ACCOUNTS',
  accountUsers: (accountId: string) => `${accountPk(accountId)}#USERS`,
  siteUsers: (siteId: string) => `SITE#${siteId}#USERS`,
  accountNumbers: (accountId: string) => `${accountPk(accountId)}#NUMBERS`,
  siteNumbers: (siteId: string) => `SITE#${siteId}#NUMBERS`,
  allOrders: () => 'ORDERS',
  ordersByStatus: (status: string) => `ORDERS#${status}`,
  subscribers: (accountId: string) => `SUBSCRIPTION#${accountId}`,
};

export const accountIdFromPk = (pk: string): string | null =>
  pk.startsWith('ACCOUNT#') ? pk.slice('ACCOUNT#'.length) : null;
