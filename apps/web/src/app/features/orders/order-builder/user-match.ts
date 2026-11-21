import { VoiceUser } from '@provisioning/contracts';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .trim();

/**
 * Users matching what someone typed into a picker: every word must appear in the
 * name or email ("pri sh" finds Priya Shah), and digits match the extension or the
 * number however they are typed ("2104", "555-0142"). Sorted by name, or by
 * extension when the query is digits.
 */
export function matchUsers(users: readonly VoiceUser[], query: string): VoiceUser[] {
  const text = fold(query);
  const digits = text.replace(/\D/g, '');
  const numeric = digits.length > 0 && /^[\d\s()+.-]+$/.test(text);
  const words = text.split(/\s+/).filter(Boolean);
  const matches = users.filter((user) => {
    if (numeric) {
      return user.extension.includes(digits) || (user.did?.includes(digits) ?? false);
    }
    const haystack = fold(`${user.firstName} ${user.lastName} ${user.email}`);
    return words.every((word) => haystack.includes(word));
  });
  return matches.sort((a, b) =>
    numeric
      ? a.extension.localeCompare(b.extension)
      : `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'en'),
  );
}
