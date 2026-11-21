import { describe, expect, it } from 'vitest';
import {
  ApiPaths,
  ClientMessage,
  CreateOrderRequest,
  DraftLine,
  OrderLine,
  UserChanges,
} from './index';

const snapshot = {
  firstName: 'Priya',
  lastName: 'Shah',
  email: 'priya.shah@example.com',
  siteId: 'site_kanata',
  extension: '2101',
  did: '+16135550101',
  voicemail: true,
  deviceModel: 'desk-d400',
  macAddress: null,
};

describe('contracts', () => {
  it('accepts a draft add_user line without extension or DID', () => {
    const line = DraftLine.parse({
      action: 'add_user',
      siteId: 'site_kanata',
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya.shah@example.com',
      voicemail: true,
      deviceModel: null,
    });
    expect(line.action).toBe('add_user');
  });

  it('rejects an update with no changes', () => {
    expect(UserChanges.safeParse({}).success).toBe(false);
  });

  it('rejects malformed numbers and extensions', () => {
    const bad = { action: 'add_user', user: { ...snapshot, did: '613-555-0101', extension: '21' } };
    const result = CreateOrderRequest.safeParse({
      lines: [bad],
      source: 'manual',
      prompt: null,
      idempotencyKey: '3b241101-e2bb-4255-8caf-4136c566a962',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.at(-1))).toEqual(
      expect.arrayContaining(['did', 'extension']),
    );
  });

  it('combines a resolved line with its progress', () => {
    const line = OrderLine.parse({
      action: 'add_user',
      user: snapshot,
      lineId: 'L001',
      status: 'provisioning',
      attempts: 1,
      step: 'Reserving number with carrier',
      error: null,
      userId: null,
      updatedAt: '2026-11-21T14:03:00.000Z',
    });
    expect(line.status).toBe('provisioning');
  });

  it('encodes path parameters', () => {
    expect(ApiPaths.order('acc 1', 'ord/2')).toBe('/accounts/acc%201/orders/ord%2F2');
  });

  it('parses WebSocket client messages by action', () => {
    expect(ClientMessage.parse({ action: 'subscribe', accountId: '*' })).toEqual({
      action: 'subscribe',
      accountId: '*',
    });
    expect(ClientMessage.safeParse({ action: 'drop_table' }).success).toBe(false);
  });
});
