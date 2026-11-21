import type { Order, PhoneNumber, SearchEntity, VoiceUser } from '@provisioning/contracts';
import { lineSubject } from '../domain/snapshots';

/** What the search index stores for each user, number and order. */
export interface SearchDocument {
  entity: SearchEntity;
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  subtitle: string;
  status: string | null;
  text: string[];
  digits: string[];
  updatedAt: string;
}

/** Names the documents show but the items do not carry. Implementations cache. */
export interface SearchLookups {
  accountName(accountId: string): Promise<string>;
  siteName(accountId: string, siteId: string): Promise<string>;
  userName(accountId: string, userId: string): Promise<string | null>;
}

export const documentId = (entity: SearchEntity, id: string) => `${entity}:${id}`;

/** "+16135550142" -> "(613) 555-0142", the way the app shows numbers everywhere else. */
export function formatE164(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Digit strings a person might type for a number: with and without the country code. */
const numberDigits = (e164: string) => {
  const digits = e164.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? [digits, digits.slice(1)] : [digits];
};

export async function userDocument(
  user: VoiceUser,
  lookups: SearchLookups,
): Promise<SearchDocument> {
  const [accountName, siteName] = await Promise.all([
    lookups.accountName(user.accountId),
    lookups.siteName(user.accountId, user.siteId),
  ]);
  return {
    entity: 'user',
    id: user.id,
    accountId: user.accountId,
    accountName,
    title: `${user.firstName} ${user.lastName}`,
    subtitle: [`Ext ${user.extension}`, user.did ? formatE164(user.did) : null, siteName]
      .filter(Boolean)
      .join(' · '),
    status: user.status,
    text: [user.email, siteName, accountName],
    digits: [user.extension, ...(user.did ? numberDigits(user.did) : [])],
    updatedAt: user.updatedAt,
  };
}

export async function numberDocument(
  number: PhoneNumber,
  lookups: SearchLookups,
): Promise<SearchDocument> {
  const [accountName, siteName, userName] = await Promise.all([
    lookups.accountName(number.accountId),
    lookups.siteName(number.accountId, number.siteId),
    number.userId ? lookups.userName(number.accountId, number.userId) : Promise.resolve(null),
  ]);
  const holder =
    number.status === 'available'
      ? 'Available'
      : userName
        ? `${number.status === 'reserved' ? 'Reserved for' : 'Assigned to'} ${userName}`
        : number.status === 'reserved'
          ? 'Reserved'
          : 'Assigned';
  return {
    entity: 'number',
    id: number.e164,
    accountId: number.accountId,
    accountName,
    title: formatE164(number.e164),
    subtitle: `${siteName} · ${holder}`,
    status: number.status,
    text: [siteName, accountName, ...(userName ? [userName] : [])],
    digits: numberDigits(number.e164),
    updatedAt: number.updatedAt,
  };
}

export function orderDocument(order: Order): SearchDocument {
  const lines = `${order.counts.total} line${order.counts.total === 1 ? '' : 's'}`;
  return {
    entity: 'order',
    id: order.id,
    accountId: order.accountId,
    accountName: order.accountName,
    title: order.title,
    subtitle: `${order.accountName} · ${lines} · submitted by ${order.submittedBy}`,
    status: order.status,
    // The people an order touches, so searching a name also finds its orders.
    text: [
      order.id,
      order.accountName,
      order.submittedBy,
      ...(order.prompt ? [order.prompt] : []),
      ...order.lines.map((l) => `${lineSubject(l).firstName} ${lineSubject(l).lastName}`),
    ],
    digits: [],
    updatedAt: order.updatedAt,
  };
}
