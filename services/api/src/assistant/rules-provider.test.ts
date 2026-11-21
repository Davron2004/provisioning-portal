import { describe, expect, it } from 'vitest';
import { OrderIntent } from '@provisioning/contracts';
import { parseRequest, RulesIntentProvider } from './rules-provider';

const target = (
  overrides: Partial<{ site: string | null; extensions: string[]; names: string[]; all: boolean }>,
) => ({
  site: null,
  extensions: [],
  names: [],
  all: false,
  ...overrides,
});

describe('rules parser', () => {
  it.each([
    [
      'add 20 users at the Kanata site with voicemail',
      { op: 'add_users', site: 'Kanata', count: 20, people: [], voicemail: true, device: null },
    ],
    [
      'add Priya Shah and Tom Lee to Ottawa HQ with desk phones',
      {
        op: 'add_users',
        site: 'Ottawa HQ',
        count: 2,
        people: [
          { firstName: 'Priya', lastName: 'Shah', email: null },
          { firstName: 'Tom', lastName: 'Lee', email: null },
        ],
        voicemail: true,
        device: 'desk phones',
      },
    ],
    ['remove extension 2104', { op: 'remove_users', target: target({ extensions: ['2104'] }) }],
    [
      'turn off voicemail for everyone at Gatineau',
      {
        op: 'update_users',
        target: target({ site: 'Gatineau', all: true }),
        set: { voicemail: false, device: null },
      },
    ],
  ])('understands "%s"', (text, operation) => {
    const intent = parseRequest(text);
    expect(() => OrderIntent.parse(intent)).not.toThrow();
    expect(intent).toEqual({ operations: [operation], unresolved: [] });
  });

  it('handles several clauses, number words and devices on changes', () => {
    const intent = parseRequest(
      'Add three users to Toronto Lab without voicemail on softphones. Then give Tom Lee a D400 desk phone; remove extensions 2101 and 2102',
    );
    expect(intent.operations).toEqual([
      {
        op: 'add_users',
        site: 'Toronto Lab',
        count: 3,
        people: [],
        voicemail: false,
        device: 'softphones',
      },
      {
        op: 'update_users',
        target: target({ names: ['Tom Lee'] }),
        set: { voicemail: null, device: 'D400 desk phone' },
      },
      { op: 'remove_users', target: target({ extensions: ['2101', '2102'] }) },
    ]);
  });

  it('understands enabling voicemail and switching devices for a site', () => {
    expect(parseRequest('enable voicemail for Priya Shah at Kanata').operations[0]).toEqual({
      op: 'update_users',
      target: target({ site: 'Kanata', names: ['Priya Shah'] }),
      set: { voicemail: true, device: null },
    });
    expect(parseRequest('switch everyone at Kanata to softphones').operations[0]).toEqual({
      op: 'update_users',
      target: target({ site: 'Kanata', all: true }),
      set: { voicemail: null, device: 'softphones' },
    });
  });

  it('leaves what it does not understand in unresolved', () => {
    expect(parseRequest('order pizza for the team')).toEqual({
      operations: [],
      unresolved: ['order pizza for the team'],
    });
    // "everyone" without a site is too broad to act on.
    expect(parseRequest('remove everyone').unresolved).toEqual(['remove everyone']);
    expect(parseRequest('add 500 users at Kanata').unresolved).toEqual(['add 500 users at Kanata']);
  });

  it('reports itself honestly as the rules provider', async () => {
    const provider = new RulesIntentProvider();
    expect([provider.name, provider.model]).toEqual(['rules', null]);
    await expect(provider.interpret('remove extension 2104')).resolves.toMatchObject({
      operations: [{ op: 'remove_users' }],
    });
  });
});
