import { BadRequestError } from '../errors';

export type DynamoKey = Record<string, string>;

/**
 * Pagination cursors are the DynamoDB LastEvaluatedKey, base64url-encoded so
 * clients treat them as opaque. Decoding checks the shape and that the cursor
 * belongs to the same partition as the query, so a cursor from one list
 * cannot be replayed against another.
 */
export function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(
  cursor: string | null | undefined,
  expected?: { attribute: string; value: string },
): DynamoKey | undefined {
  if (!cursor) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Object.values(parsed).every((v) => typeof v === 'string')
  ) {
    throw invalidCursor();
  }
  const key = parsed as DynamoKey;
  if (expected && key[expected.attribute] !== expected.value) throw invalidCursor();
  return key;
}

const invalidCursor = () => new BadRequestError('The pagination cursor is invalid or expired');
