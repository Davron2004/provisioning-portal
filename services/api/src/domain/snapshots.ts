import type { ResolvedLine, UserSnapshot, VoiceUser } from '@provisioning/contracts';

/** The provisioning-relevant view of a user, as used in order lines. */
export function toSnapshot(user: VoiceUser): UserSnapshot {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    siteId: user.siteId,
    extension: user.extension,
    did: user.did,
    voicemail: user.voicemail,
    deviceModel: user.device?.model ?? null,
    macAddress: user.device?.macAddress ?? null,
  };
}

/** The user a line is about: the new user for adds, the current user otherwise. */
export function lineSubject(line: ResolvedLine): UserSnapshot {
  return line.action === 'add_user' ? line.user : line.before;
}

export function lineLabel(index: number, line: ResolvedLine): string {
  const who = lineSubject(line);
  return `Line ${index + 1} (${who.firstName} ${who.lastName})`;
}

export const lineIdFor = (index: number) => `line-${index + 1}`;

/** Lowercase ASCII email local part from a person's name: "Jean-Luc Côté" -> "jean-luc.cote". */
export function emailLocalPart(firstName: string, lastName: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '');
  return [clean(firstName), clean(lastName)].filter(Boolean).join('.');
}
