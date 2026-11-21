import { z } from 'zod';
import { Account, DeviceModel, IsoDateTime, PhoneNumber, Site, VoiceUser } from './domain';
import { OrderStatus, OrderSummary } from './orders';

/** Cursor-paginated list. `nextCursor` is opaque; pass it back as `?cursor=`. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const AccountPage = page(Account);
export type AccountPage = z.infer<typeof AccountPage>;
export const SitePage = page(Site);
export type SitePage = z.infer<typeof SitePage>;
export const VoiceUserPage = page(VoiceUser);
export type VoiceUserPage = z.infer<typeof VoiceUserPage>;
export const PhoneNumberPage = page(PhoneNumber);
export type PhoneNumberPage = z.infer<typeof PhoneNumberPage>;
export const OrderSummaryPage = page(OrderSummary);
export type OrderSummaryPage = z.infer<typeof OrderSummaryPage>;

export const DeviceCatalog = z.object({ items: z.array(DeviceModel) });
export type DeviceCatalog = z.infer<typeof DeviceCatalog>;

export const ApiErrorCode = z.enum([
  'bad_request',
  'unauthorized',
  'not_found',
  'conflict',
  'validation_failed',
  'assistant_unavailable',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Every non-2xx response body. */
export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const SearchEntity = z.enum(['user', 'number', 'order']);
export type SearchEntity = z.infer<typeof SearchEntity>;

export const SearchHit = z.object({
  entity: SearchEntity,
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  title: z.string(),
  subtitle: z.string(),
  status: z.string().nullable(),
  /** Matched fragment with <mark>...</mark> around the hit, already HTML-escaped. */
  highlight: z.string().nullable(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  hits: z.array(SearchHit),
  tookMs: z.number().nonnegative(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const Overview = z.object({
  accounts: z.number().int().nonnegative(),
  sites: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  numbersAssigned: z.number().int().nonnegative(),
  numbersAvailable: z.number().int().nonnegative(),
  ordersByStatus: z.record(OrderStatus, z.number().int().nonnegative()),
  recentOrders: z.array(OrderSummary),
  generatedAt: IsoDateTime,
});
export type Overview = z.infer<typeof Overview>;

/**
 * REST routes, relative to the API base URL. All require a bearer token.
 *
 * GET    /overview
 * GET    /catalog/devices
 * GET    /search?q=&entity=&accountId=&limit=
 * GET    /accounts?cursor=
 * GET    /accounts/{accountId}
 * GET    /accounts/{accountId}/sites
 * GET    /accounts/{accountId}/users?siteId=&cursor=
 * GET    /accounts/{accountId}/numbers?siteId=&status=&cursor=
 * GET    /accounts/{accountId}/orders?status=&cursor=
 * GET    /accounts/{accountId}/orders/{orderId}
 * POST   /accounts/{accountId}/orders/preview      body: OrderDraft          -> OrderPreview
 * POST   /accounts/{accountId}/orders              body: CreateOrderRequest  -> 202 Order
 * POST   /accounts/{accountId}/orders/{orderId}/retry                        -> 202 Order
 * POST   /accounts/{accountId}/assistant/interpret body: InterpretRequest    -> InterpretResponse
 * GET    /orders?status=&cursor=                   (all accounts, newest first)
 */
export const ApiPaths = {
  overview: () => '/overview',
  devices: () => '/catalog/devices',
  search: () => '/search',
  accounts: () => '/accounts',
  account: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}`,
  sites: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/sites`,
  users: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/users`,
  numbers: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/numbers`,
  orders: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/orders`,
  order: (accountId: string, orderId: string) =>
    `/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`,
  orderPreview: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/orders/preview`,
  orderRetry: (accountId: string, orderId: string) =>
    `/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}/retry`,
  interpret: (accountId: string) =>
    `/accounts/${encodeURIComponent(accountId)}/assistant/interpret`,
  allOrders: () => '/orders',
} as const;
