import { describe, expect, it } from 'vitest';
import type { VoiceUser } from '@provisioning/contracts';
import { user } from '../test-support/fixtures';
import { createUserMatcher } from './user-search';

const ada = user({
  id: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada.lovelace@example.com',
  extension: '2101',
  did: '+16135550142',
}) as VoiceUser;
const noDid = user({ id: 'u2', firstName: 'Grace', lastName: 'Hopper', extension: '3300' });

const matches = (q: string, u: VoiceUser = ada) => createUserMatcher(q)(u);

describe('createUserMatcher', () => {
  it('matches names and email case-insensitively', () => {
    expect(matches('ADA')).toBe(true);
    expect(matches('lovel')).toBe(true);
    expect(matches('ada love')).toBe(true);
    expect(matches('LOVELACE@EXAMPLE')).toBe(true);
    expect(matches('turing')).toBe(false);
  });

  it('ignores accents', () => {
    const jose = user({ id: 'u3', firstName: 'José', lastName: 'Bélanger' });
    expect(matches('jose belanger', jose)).toBe(true);
    expect(matches('JOSÉ', jose)).toBe(true);
  });

  it('requires every term to match', () => {
    expect(matches('ada hopper')).toBe(false);
    expect(matches('lovelace 2101')).toBe(true);
  });

  it('matches the extension', () => {
    expect(matches('2101')).toBe(true);
    expect(matches('210')).toBe(true);
    expect(matches('9999')).toBe(false);
  });

  it('matches the DID however it is typed', () => {
    for (const q of [
      '613 555 0142',
      '5550142',
      '(613) 555-0142',
      '+1 613 555 0142',
      '+16135550142',
    ]) {
      expect(matches(q), q).toBe(true);
    }
    expect(matches('613 555 0199')).toBe(false);
  });

  it('does not match a missing DID, and blank queries match everything', () => {
    expect(matches('5550142', noDid)).toBe(false);
    expect(matches('   ')).toBe(true);
  });
});
