import {
  Account,
  DeviceModel,
  Order,
  OrderSummary,
  Overview,
  PhoneNumber,
  Site,
  VoiceUser,
} from '@provisioning/contracts';

export function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    ...anOrderSummary(),
    prompt: null,
    lines: [],
    events: [],
    ...overrides,
  };
}

export function anOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'ord_0001',
    accountId: 'acc_northwind',
    accountName: 'Northwind Dental',
    status: 'provisioning',
    source: 'manual',
    title: 'Add 2 users at Kanata Campus',
    counts: { total: 2, pending: 1, provisioning: 1, succeeded: 0, failed: 0 },
    submittedBy: 'admin@example.com',
    createdAt: '2026-11-21T14:00:00.000Z',
    updatedAt: '2026-11-21T14:01:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

export function anAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_northwind',
    name: 'Northwind Dental',
    plan: 'business',
    status: 'active',
    primaryContact: { name: 'Rosa Diaz', email: 'rosa.diaz@northwind.example.com' },
    siteCount: 2,
    userCount: 30,
    numbersAssigned: 30,
    numbersTotal: 60,
    createdAt: '2025-03-01T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...overrides,
  };
}

export function aSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site_kanata',
    accountId: 'acc_northwind',
    name: 'Kanata Campus',
    address: {
      line1: '4000 Innovation Drive',
      city: 'Kanata',
      region: 'ON',
      postalCode: 'K2K 3G9',
      country: 'CA',
    },
    timezone: 'America/Toronto',
    extensionRange: { start: '2100', end: '2199' },
    userCount: 18,
    numbersAvailable: 12,
    createdAt: '2025-03-01T12:00:00.000Z',
    ...overrides,
  };
}

export function aUser(overrides: Partial<VoiceUser> = {}): VoiceUser {
  return {
    id: 'usr_0001',
    accountId: 'acc_northwind',
    siteId: 'site_kanata',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada.lovelace@northwind.example.com',
    extension: '2101',
    did: '+16135550142',
    voicemail: true,
    device: { model: 'dev_d200', macAddress: '00:1A:2B:3C:4D:5E' },
    status: 'active',
    lastOrderId: null,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

export function aNumber(overrides: Partial<PhoneNumber> = {}): PhoneNumber {
  return {
    e164: '+16135550100',
    accountId: 'acc_northwind',
    siteId: 'site_kanata',
    status: 'available',
    userId: null,
    orderId: null,
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

export function aDevice(overrides: Partial<DeviceModel> = {}): DeviceModel {
  return {
    id: 'dev_d200',
    name: 'D200 desk phone',
    kind: 'desk',
    description: 'Two-line desk phone',
    requiresMac: true,
    ...overrides,
  };
}

export function anOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    accounts: 5,
    sites: 13,
    users: 192,
    numbersAssigned: 189,
    numbersAvailable: 221,
    ordersByStatus: { submitted: 0, validating: 0, provisioning: 1, active: 10, failed: 2 },
    recentOrders: [anOrderSummary()],
    generatedAt: '2026-11-21T14:05:00.000Z',
    ...overrides,
  };
}

/** A cursor page, as every list endpoint returns. */
export function aPage<T>(items: T[], nextCursor: string | null = null) {
  return { items, nextCursor };
}
