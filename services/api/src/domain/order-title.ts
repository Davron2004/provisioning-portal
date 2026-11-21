import type { ResolvedLine } from '@provisioning/contracts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function personName(line: ResolvedLine): string {
  const snapshot = line.action === 'add_user' ? line.user : line.before;
  return `${snapshot.firstName} ${snapshot.lastName}`;
}

function siteOf(line: ResolvedLine): string {
  return line.action === 'add_user' ? line.user.siteId : line.before.siteId;
}

/**
 * One-line order description shown in lists, e.g. "Add 20 users at Kanata
 * Campus", "Remove Priya Shah", "Add 2 users, remove 1 user".
 */
export function orderTitle(
  lines: readonly ResolvedLine[],
  siteNames: ReadonlyMap<string, string>,
): string {
  const groups = {
    add: lines.filter((l) => l.action === 'add_user'),
    update: lines.filter((l) => l.action === 'update_user'),
    remove: lines.filter((l) => l.action === 'remove_user'),
  };
  const present = Object.entries(groups).filter(([, ls]) => ls.length > 0);
  const siteIds = new Set(lines.map(siteOf));
  const singleSite = siteIds.size === 1 ? siteNames.get([...siteIds][0]!) : undefined;
  const atSite = singleSite ? ` at ${singleSite}` : '';

  if (present.length === 1) {
    const [kind, ls] = present[0]!;
    const verb = kind === 'add' ? 'Add' : kind === 'update' ? 'Update' : 'Remove';
    const what = ls.length === 1 ? personName(ls[0]!) : plural(ls.length, 'user');
    return `${verb} ${what}${atSite}`;
  }

  const parts = present.map(([kind, ls]) => `${kind} ${plural(ls.length, 'user')}`);
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${atSite}`;
}
