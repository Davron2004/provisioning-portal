import type { Account, PhoneNumber, Site } from '@provisioning/contracts';
import type { UserRecord } from '../data/items';
import type { AccountContext } from '../domain/order-validation';

/** A small, readable account for unit tests: two sites, three users, a handful of numbers. */
export const T0 = '2026-11-01T12:00:00.000Z';

export const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'acc_test',
  name: 'Test Co',
  plan: 'business',
  status: 'active',
  primaryContact: { name: 'Pat Admin', email: 'pat@test.example.com' },
  siteCount: 2,
  userCount: 3,
  numbersAssigned: 3,
  numbersTotal: 6,
  createdAt: T0,
  updatedAt: T0,
  ...overrides,
});

export const site = (id: string, name: string, start: string, end: string): Site => ({
  id,
  accountId: 'acc_test',
  name,
  address: {
    line1: '1 Main St',
    city: 'Ottawa',
    region: 'ON',
    postalCode: 'K1A 0A1',
    country: 'CA',
  },
  timezone: 'America/Toronto',
  extensionRange: { start, end },
  userCount: 0,
  numbersAvailable: 0,
  createdAt: T0,
});

export const user = (overrides: Partial<UserRecord> & Pick<UserRecord, 'id'>): UserRecord => ({
  accountId: 'acc_test',
  siteId: 'site_k',
  firstName: 'Sofia',
  lastName: 'Beaulieu',
  email: `${overrides.id}@test.example.com`,
  extension: '2100',
  did: null,
  voicemail: true,
  device: null,
  status: 'active',
  lastOrderId: null,
  createdAt: T0,
  updatedAt: T0,
  pendingOrderId: null,
  ...overrides,
});

export const number = (
  e164: string,
  siteId: string,
  status: PhoneNumber['status'] = 'available',
  userId: string | null = null,
): PhoneNumber => ({
  e164,
  accountId: 'acc_test',
  siteId,
  status,
  userId,
  orderId: null,
  updatedAt: T0,
});

export function testContext(overrides: Partial<AccountContext> = {}): AccountContext {
  return {
    account: account(),
    sites: [
      site('site_k', 'Kanata Campus', '2100', '2105'),
      site('site_o', 'Ottawa HQ', '2000', '2099'),
    ],
    users: [
      user({
        id: 'u1',
        extension: '2100',
        did: '+16135550100',
        firstName: 'Sofia',
        lastName: 'Beaulieu',
      }),
      user({
        id: 'u2',
        extension: '2102',
        did: '+16135550101',
        firstName: 'Omar',
        lastName: 'Haddad',
        device: { model: 'desk-d400', macAddress: '02:00:00:00:00:02' },
      }),
      user({
        id: 'u3',
        siteId: 'site_o',
        extension: '2000',
        did: '+16135550150',
        firstName: 'Mei',
        lastName: 'Chen',
      }),
    ],
    numbers: [
      number('+16135550100', 'site_k', 'assigned', 'u1'),
      number('+16135550101', 'site_k', 'assigned', 'u2'),
      number('+16135550103', 'site_k'),
      number('+16135550102', 'site_k'),
      number('+16135550150', 'site_o', 'assigned', 'u3'),
      number('+16135550151', 'site_o'),
    ],
    macOwners: new Map([['02:00:00:00:00:02', { accountId: 'acc_test', userId: 'u2' }]]),
    ...overrides,
  };
}
