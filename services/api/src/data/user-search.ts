import type { VoiceUser } from '@provisioning/contracts';

/** Lower-case and accent-insensitive, so "jose" finds "José". */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Digits only, so "(613) 555-0142", "+1 613 555 0142" and "6135550142" compare equal. */
const digitsOf = (value: string): string => value.replace(/\D/g, '');

export interface UserMatcher {
  (user: VoiceUser): boolean;
}

/**
 * Builds a case-insensitive "contains" matcher for the users text filter.
 * Every whitespace-separated term must match somewhere (first name, last name,
 * "first last", email, extension) so "ada love" finds Ada Lovelace. A term that
 * contains digits also matches against the DID's digits however it was typed,
 * and a multi-group number like "613 555 0142" is checked as one number.
 */
export function createUserMatcher(q: string): UserMatcher {
  const text = fold(q.trim());
  const terms = text.split(/\s+/).filter(Boolean);
  const wholeDigits = digitsOf(text);
  // "613 555 0142" is a phone number typed with spaces: compare it as one.
  const phoneLike = wholeDigits.length > 0 && /^[\d\s()+.-]+$/.test(text);

  const matchesTerm = (user: VoiceUser, term: string): boolean => {
    const did = user.did ? digitsOf(user.did) : '';
    const digits = digitsOf(term);
    return (
      fold(user.firstName).includes(term) ||
      fold(user.lastName).includes(term) ||
      fold(`${user.firstName} ${user.lastName}`).includes(term) ||
      fold(user.email).includes(term) ||
      user.extension.includes(term) ||
      (digits.length > 0 && did.includes(digits))
    );
  };

  return (user) => {
    if (terms.length === 0) return true;
    if (phoneLike && user.did && digitsOf(user.did).includes(wholeDigits)) return true;
    return terms.every((term) => matchesTerm(user, term));
  };
}
