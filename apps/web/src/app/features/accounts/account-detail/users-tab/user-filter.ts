import { VoiceUser } from '@provisioning/contracts';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim();

/**
 * Matches a user by name, email, extension or DID. Digits in the query also match
 * phone numbers however they are typed: "555-0142", "(613) 555", "6135550142".
 */
export function filterUsers(users: readonly VoiceUser[], query: string): readonly VoiceUser[] {
  const text = normalize(query);
  if (!text) {
    return users;
  }
  const digits = text.replace(/\D/g, '');
  const looksLikeNumber = digits.length >= 3 && /^[\d\s()+.-]+$/.test(text);
  return users.filter((user) => {
    if (looksLikeNumber) {
      return user.extension.includes(digits) || (user.did?.includes(digits) ?? false);
    }
    return [`${user.firstName} ${user.lastName}`, user.email, user.extension].some((field) =>
      normalize(field).includes(text),
    );
  });
}
