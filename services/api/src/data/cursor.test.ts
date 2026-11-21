import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../errors';
import { decodeCursor, encodeCursor } from './cursor';

describe('pagination cursors', () => {
  const key = {
    PK: 'ACCOUNT#a',
    SK: 'USER#u1',
    GSI1PK: 'ACCOUNT#a#USERS',
    GSI1SK: 'shah#priya#u1',
  };

  it('round-trips a LastEvaluatedKey as an opaque url-safe string', () => {
    const cursor = encodeCursor(key)!;
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, { attribute: 'GSI1PK', value: 'ACCOUNT#a#USERS' })).toEqual(key);
  });

  it('returns null when there is no next page', () => {
    expect(encodeCursor(undefined)).toBeNull();
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
  });

  it.each([
    ['garbage', 'not-base64-json'],
    ['an array', Buffer.from('[1]').toString('base64url')],
    ['non-string values', Buffer.from('{"PK":1}').toString('base64url')],
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(BadRequestError);
  });

  it('rejects a cursor from a different list', () => {
    const cursor = encodeCursor(key);
    expect(() => decodeCursor(cursor, { attribute: 'GSI1PK', value: 'ACCOUNT#b#USERS' })).toThrow(
      'The pagination cursor is invalid or expired',
    );
  });
});
