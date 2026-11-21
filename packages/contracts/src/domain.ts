import { z } from 'zod';

/** ISO-8601 timestamp in UTC, e.g. 2026-11-21T14:03:00.000Z. */
export const IsoDateTime = z.iso.datetime();

/** North American E.164 number, e.g. +16135550142. */
export const E164 = z.string().regex(/^\+1\d{10}$/, 'Expected an E.164 number like +16135550142');

/** Internal extension: 3 to 6 digits. */
export const Extension = z.string().regex(/^\d{3,6}$/, 'Extension must be 3 to 6 digits');

export const MacAddress = z
  .string()
  .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/, 'MAC address must look like 00:1A:2B:3C:4D:5E');

export const PersonName = z.string().trim().min(1).max(60);

export const AccountPlan = z.enum(['essentials', 'business', 'enterprise']);
export type AccountPlan = z.infer<typeof AccountPlan>;

export const AccountStatus = z.enum(['onboarding', 'active', 'suspended']);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const Address = z.object({
  line1: z.string(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
  country: z.string().length(2),
});
export type Address = z.infer<typeof Address>;

/** A customer tenant of the phone service. */
export const Account = z.object({
  id: z.string(),
  name: z.string(),
  plan: AccountPlan,
  status: AccountStatus,
  primaryContact: z.object({ name: z.string(), email: z.email() }),
  siteCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  numbersAssigned: z.number().int().nonnegative(),
  numbersTotal: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Account = z.infer<typeof Account>;

/** A physical location of an account. Users, numbers and extensions belong to a site. */
export const Site = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  address: Address,
  timezone: z.string(),
  /** Extensions are allocated from this inclusive range. */
  extensionRange: z.object({ start: Extension, end: Extension }),
  userCount: z.number().int().nonnegative(),
  numbersAvailable: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
});
export type Site = z.infer<typeof Site>;

export const DeviceKind = z.enum(['desk', 'conference', 'dect', 'softphone']);
export type DeviceKind = z.infer<typeof DeviceKind>;

/** Device catalog entry. Generic models; no vendor branding. */
export const DeviceModel = z.object({
  id: z.string(),
  name: z.string(),
  kind: DeviceKind,
  description: z.string(),
  /** Hardware devices need a MAC address before they can be configured. */
  requiresMac: z.boolean(),
});
export type DeviceModel = z.infer<typeof DeviceModel>;

export const UserStatus = z.enum(['provisioning', 'active', 'failed', 'removing']);
export type UserStatus = z.infer<typeof UserStatus>;

export const UserDevice = z.object({
  model: z.string(),
  macAddress: MacAddress.nullable(),
});
export type UserDevice = z.infer<typeof UserDevice>;

/** A provisioned phone-service user (subscriber) at a site. */
export const VoiceUser = z.object({
  id: z.string(),
  accountId: z.string(),
  siteId: z.string(),
  firstName: PersonName,
  lastName: PersonName,
  email: z.email(),
  extension: Extension,
  did: E164.nullable(),
  voicemail: z.boolean(),
  device: UserDevice.nullable(),
  status: UserStatus,
  /** The order that last changed this user. */
  lastOrderId: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type VoiceUser = z.infer<typeof VoiceUser>;

export const NumberStatus = z.enum(['available', 'reserved', 'assigned']);
export type NumberStatus = z.infer<typeof NumberStatus>;

/** A DID (direct inward dialing) number in an account's inventory. */
export const PhoneNumber = z.object({
  e164: E164,
  accountId: z.string(),
  siteId: z.string(),
  status: NumberStatus,
  userId: z.string().nullable(),
  /** Set while an in-flight order holds the number. */
  orderId: z.string().nullable(),
  updatedAt: IsoDateTime,
});
export type PhoneNumber = z.infer<typeof PhoneNumber>;
