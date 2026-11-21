import {
  AssistantProvider,
  IntentOperation,
  Site,
  TargetSelector,
  VoiceUser,
} from '@provisioning/contracts';

/**
 * Plain-language text for what the assistant understood. The intent holds the
 * person's own words (site and device names as written), so they are quoted, not
 * translated: the resolution notes say what each one was matched to.
 */

const quote = (text: string) => `“${text}”`;

function list(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function describeTarget(target: TargetSelector): string {
  const parts: string[] = [];
  if (target.all) {
    parts.push(target.site ? `everyone at ${quote(target.site)}` : 'everyone');
  } else {
    if (target.names.length > 0) {
      parts.push(list(target.names));
    }
    if (target.extensions.length > 0) {
      parts.push(
        `${target.extensions.length === 1 ? 'extension' : 'extensions'} ${list(target.extensions)}`,
      );
    }
    if (target.site && parts.length > 0) {
      parts[parts.length - 1] += ` at ${quote(target.site)}`;
    }
  }
  return list(parts) || 'nobody';
}

/** One sentence per operation, e.g. "Add 20 users at “Kanata” with voicemail, no device". */
export function describeOperation(operation: IntentOperation): string {
  switch (operation.op) {
    case 'add_users': {
      const named = operation.people.map((p) => `${p.firstName} ${p.lastName}`.trim());
      const unnamed = operation.count - named.length;
      const who = [
        ...(named.length ? [list(named)] : []),
        ...(unnamed > 0
          ? [`${unnamed} ${named.length ? 'more' : ''} ${unnamed === 1 ? 'user' : 'users'}`]
          : []),
      ]
        .join(' and ')
        .replace(/\s+/g, ' ');
      const voicemail = operation.voicemail ? 'with voicemail' : 'without voicemail';
      const device = operation.device ? `a ${quote(operation.device)}` : 'no device';
      return `Add ${who} at ${quote(operation.site)}, ${voicemail}, ${device}`;
    }
    case 'update_users': {
      const changes: string[] = [];
      if (operation.set.voicemail !== null) {
        changes.push(`turn voicemail ${operation.set.voicemail ? 'on' : 'off'}`);
      }
      if (operation.set.device !== null) {
        changes.push(
          operation.set.device.toLowerCase() === 'none'
            ? 'remove the device'
            : `switch the device to ${quote(operation.set.device)}`,
        );
      }
      const what = list(changes) || 'change nothing';
      return `${what[0]!.toUpperCase()}${what.slice(1)} for ${describeTarget(operation.target)}`;
    }
    case 'remove_users':
      return `Remove ${describeTarget(operation.target)}`;
  }
}

const MODEL_FAMILIES: Readonly<Record<string, string>> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

/** "anthropic.claude-opus-5-5" -> "Claude Opus 5.5"; anything else as given. */
export function modelName(model: string): string {
  const match = /claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(model);
  if (!match) {
    return model;
  }
  const [, family, major, minor] = match;
  return `Claude ${MODEL_FAMILIES[family!.toLowerCase()]} ${major}${minor ? `.${minor}` : ''}`;
}

/** Who interpreted the request, honestly: the offline parser, or which model where. */
export function providerLabel(provider: AssistantProvider, model: string | null): string {
  switch (provider) {
    case 'rules':
      return 'Rules (offline parser, no language model)';
    case 'bedrock':
      return `${model ? modelName(model) : 'Claude'} via Amazon Bedrock`;
    case 'anthropic':
      return `${model ? modelName(model) : 'Claude'} via the Claude API`;
  }
}

export interface ExamplePrompt {
  readonly text: string;
}

/**
 * Example requests that work for this account, built from its own sites and users,
 * so a click always leads somewhere: a bulk add where there are free numbers, a
 * named add, a voicemail change for a site, and removing a real extension.
 */
export function examplePrompts(
  sites: readonly Site[],
  users: readonly VoiceUser[],
): ExamplePrompt[] {
  if (sites.length === 0) {
    return [];
  }
  const byFreeNumbers = [...sites].sort((a, b) => b.numbersAvailable - a.numbersAvailable);
  const roomiest = byFreeNumbers[0]!;
  const count = Math.max(1, Math.min(20, roomiest.numbersAvailable));
  const second = byFreeNumbers[1] ?? roomiest;
  const withVoicemail = sites.find((site) =>
    users.some((user) => user.siteId === site.id && user.voicemail),
  );
  const someone = [...users].sort((a, b) => a.extension.localeCompare(b.extension))[0];

  const examples = [
    `Add ${count} users at the ${roomiest.name} site with voicemail`,
    `Add Priya Shah and Tom Lee to ${second.name} with desk phones`,
  ];
  if (withVoicemail) {
    examples.push(`Turn off voicemail for everyone at ${withVoicemail.name}`);
  }
  if (someone) {
    examples.push(`Remove extension ${someone.extension}`);
  }
  return examples.map((text) => ({ text }));
}
