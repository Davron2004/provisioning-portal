import type { IntentOperation, OrderIntent, TargetSelector } from '@provisioning/contracts';
import type { IntentProvider } from './provider';

/**
 * A small deterministic parser for the common phrasings, used for local
 * development, CI and E2E (no model credentials needed). It is not a
 * language model and the API response says so (`provider: "rules"`).
 *
 * Understood, per clause (clauses split on ".", ";", " then "):
 *   add 20 users at the Kanata site with voicemail
 *   add Priya Shah and Tom Lee to Ottawa HQ with desk phones
 *   remove extension 2104 | remove Priya Shah | remove everyone at Gatineau
 *   turn off voicemail for everyone at Gatineau | enable voicemail for extension 2101
 *   give Tom Lee a softphone | switch everyone at Kanata to D400 phones
 * Anything else goes to `unresolved`.
 */
export class RulesIntentProvider implements IntentProvider {
  readonly name = 'rules' as const;
  readonly model = null;

  async interpret(text: string): Promise<OrderIntent> {
    return parseRequest(text);
  }
}

// prettier-ignore
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30,
};

const DEVICE_PATTERN =
  /\b((?:basic |colou?r |cordless |dect |conference )?(?:desk ?phones?|phones?|handsets?|softphones?|soft phones?|apps?)|d200s?|d400s?|c100s?|h300s?|no (?:phone|device)s?)\b/i;

export function parseRequest(text: string): OrderIntent {
  const operations: IntentOperation[] = [];
  const unresolved: string[] = [];
  for (const clause of splitClauses(text)) {
    const op =
      parseAdd(clause) ?? parseVoicemail(clause) ?? parseDevice(clause) ?? parseRemove(clause);
    if (op && operations.length < 10) operations.push(op);
    else unresolved.push(clause);
  }
  return { operations, unresolved };
}

function splitClauses(text: string): string[] {
  return text
    .split(/(?:[.;\n]+|\bthen\b)/i)
    .map((c) =>
      c
        .trim()
        .replace(/^(?:and|also|please)\s+/i, '')
        .replace(/[,!]+$/, ''),
    )
    .filter((c) => c.length > 0);
}

// --- add ---------------------------------------------------------------------

function parseAdd(clause: string): IntentOperation | null {
  const m = /^(?:please\s+)?(?:add|create|provision|onboard|set up)\s+(.+)$/i.exec(clause);
  if (!m) return null;
  let rest = m[1]!;
  const voicemail = !/\b(?:without|no) voicemail\b/i.test(rest);
  rest = rest.replace(/\b(?:with|without|and|no)\s+voicemail\b/gi, ' ');
  let device: string | null = null;
  // The last "with/and/on <device>" phrase; the device part may not contain another one.
  const withDevice = /\s(?:with|and|on)\s+(?:a |an )?((?:(?!\s(?:with|and|on)\s)[^,])+?)\s*$/i.exec(
    rest,
  );
  if (withDevice && DEVICE_PATTERN.test(withDevice[1]!)) {
    device = withDevice[1]!.trim();
    rest = rest.slice(0, withDevice.index);
  }
  const at = /^(.+?)\s+(?:at|to|in|for)\s+(?:the\s+)?(.+?)$/i.exec(rest.trim());
  if (!at) return null;
  const who = at[1]!.trim();
  const site = cleanSite(at[2]!);
  if (!site) return null;

  const counted =
    /^(\d+|[a-z]+)\s+(?:new\s+)?(?:users?|people|seats?|staff|employees?|lines?)$/i.exec(who);
  if (counted) {
    const raw = counted[1]!.toLowerCase();
    const count = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (!count || count > 100) return null;
    return { op: 'add_users', site, count, people: [], voicemail, device };
  }
  const people = splitNames(who).map((name) => {
    const parts = name.split(/\s+/);
    return { firstName: parts[0]!, lastName: parts.slice(1).join(' '), email: null };
  });
  if (people.length === 0 || people.some((p) => !p.lastName)) return null;
  return { op: 'add_users', site, count: people.length, people, voicemail, device };
}

function cleanSite(raw: string): string {
  return raw
    .replace(/\s+(?:site|office|location)$/i, '')
    .replace(/^the\s+/i, '')
    .trim();
}

// --- updates -----------------------------------------------------------------

function parseVoicemail(clause: string): IntentOperation | null {
  const m =
    /^(?:turn\s+(on|off)|(enable|disable|remove|add))\s+voicemail\s+(?:for|on|from|to)\s+(.+)$/i.exec(
      clause,
    ) ?? /^(?:turn\s+voicemail\s+(on|off)|(enable|disable))\s+(?:for|on)\s+(.+)$/i.exec(clause);
  if (!m) return null;
  const verb = (m[1] ?? m[2])!.toLowerCase();
  const voicemail = verb === 'on' || verb === 'enable' || verb === 'add';
  const target = parseTarget(m[3]!);
  return target ? { op: 'update_users', target, set: { voicemail, device: null } } : null;
}

function parseDevice(clause: string): IntentOperation | null {
  const give = /^give\s+(.+?)\s+(?:a|an|new)\s+(.+)$/i.exec(clause);
  const swap = /^(?:switch|move|change)\s+(.+?)\s+to\s+(?:a |an )?(.+)$/i.exec(clause);
  const m = give ?? swap;
  if (!m || !DEVICE_PATTERN.test(m[2]!)) return null;
  const target = parseTarget(m[1]!);
  return target
    ? { op: 'update_users', target, set: { voicemail: null, device: m[2]!.trim() } }
    : null;
}

// --- remove ------------------------------------------------------------------

function parseRemove(clause: string): IntentOperation | null {
  const m = /^(?:please\s+)?(?:remove|delete|deprovision|offboard)\s+(.+)$/i.exec(clause);
  if (!m) return null;
  const target = parseTarget(m[1]!);
  return target ? { op: 'remove_users', target } : null;
}

// --- targets -----------------------------------------------------------------

/** "everyone at Gatineau", "extension 2104 and 2105", "Priya Shah at Kanata", "Tom Lee". */
function parseTarget(raw: string): TargetSelector | null {
  let text = raw.trim();
  let site: string | null = null;
  const at = /\s+(?:at|in|from)\s+(?:the\s+)?(.+)$/i.exec(text);
  if (at) {
    site = cleanSite(at[1]!);
    text = text.slice(0, at.index).trim();
  }
  if (/^(?:everyone|everybody|all(?: the)?(?: users| staff| people)?)$/i.test(text)) {
    return site ? { site, extensions: [], names: [], all: true } : null;
  }
  const ext = /^(?:extensions?|ext\.?|x)\s+(.+)$/i.exec(text);
  if (ext) {
    const extensions = ext[1]!.split(/\s*(?:,|and|&)\s*/i).filter((e) => /^\d{3,6}$/.test(e));
    return extensions.length > 0 ? { site, extensions, names: [], all: false } : null;
  }
  const names = splitNames(text);
  return names.length > 0 ? { site, extensions: [], names, all: false } : null;
}

function splitNames(text: string): string[] {
  return text
    .split(/\s*(?:,|\band\b|&)\s*/i)
    .map((n) => n.trim())
    .filter((n) => /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)*$/u.test(n));
}
