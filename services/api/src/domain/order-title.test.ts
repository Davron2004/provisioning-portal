import { describe, expect, it } from 'vitest';
import type { ResolvedLine, UserSnapshot } from '@provisioning/contracts';
import { orderTitle } from './order-title';

const person = (firstName: string, siteId = 'site_k'): UserSnapshot => ({
  firstName,
  lastName: 'Shah',
  email: `${firstName.toLowerCase()}@example.com`,
  siteId,
  extension: '2101',
  did: null,
  voicemail: true,
  deviceModel: null,
  macAddress: null,
});
const add = (name: string, siteId?: string): ResolvedLine => ({
  action: 'add_user',
  user: person(name, siteId),
});
const remove = (name: string): ResolvedLine => ({
  action: 'remove_user',
  userId: 'u',
  before: person(name),
});
const sites = new Map([
  ['site_k', 'Kanata Campus'],
  ['site_o', 'Ottawa HQ'],
]);

describe('orderTitle', () => {
  it('names a single person', () => {
    expect(orderTitle([add('Priya')], sites)).toBe('Add Priya Shah at Kanata Campus');
    expect(orderTitle([remove('Priya')], sites)).toBe('Remove Priya Shah at Kanata Campus');
  });

  it('counts users and mentions the site when there is one', () => {
    expect(orderTitle([add('A'), add('B'), add('C')], sites)).toBe('Add 3 users at Kanata Campus');
    expect(orderTitle([add('A'), add('B', 'site_o')], sites)).toBe('Add 2 users');
  });

  it('summarises mixed orders', () => {
    expect(orderTitle([add('A'), add('B'), remove('C')], sites)).toBe(
      'Add 2 users, remove 1 user at Kanata Campus',
    );
  });
});
