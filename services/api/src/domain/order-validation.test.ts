import { describe, expect, it } from 'vitest';
import type { DraftAddUser, ResolvedLine, UserSnapshot } from '@provisioning/contracts';
import { ValidationFailedError } from '../errors';
import { account, testContext, user } from '../test-support/fixtures';
import { previewOrder, resolveDraft, validateLines } from './order-validation';
import { toSnapshot } from './snapshots';

const add = (overrides: Partial<DraftAddUser> = {}): DraftAddUser => ({
  action: 'add_user',
  siteId: 'site_k',
  firstName: 'Priya',
  lastName: 'Shah',
  email: 'priya.shah@test.example.com',
  voicemail: true,
  deviceModel: null,
  ...overrides,
});

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('resolveDraft (allocation)', () => {
  it('allocates the lowest free extension and the lowest available number at the site', () => {
    const { lines, issues } = resolveDraft(
      { lines: [add(), add({ email: 'b@test.example.com' })] },
      testContext(),
    );
    expect(issues).toEqual([]);
    expect(lines.map((l) => l.action === 'add_user' && [l.user.extension, l.user.did])).toEqual([
      ['2101', '+16135550102'],
      ['2103', '+16135550103'],
    ]);
  });

  it('never hands out values another line asks for explicitly', () => {
    const { lines } = resolveDraft(
      {
        lines: [
          add(),
          add({ email: 'b@test.example.com', extension: '2101', did: '+16135550102' }),
        ],
      },
      testContext(),
    );
    expect(lines[0]).toMatchObject({ user: { extension: '2103', did: '+16135550103' } });
  });

  it('reports running out of numbers as a preview issue', () => {
    const draft = {
      lines: [add(), add({ email: 'b@test.example.com' }), add({ email: 'c@test.example.com' })],
    };
    const { lines, issues } = resolveDraft(draft, testContext());
    expect(lines[2]).toMatchObject({ user: { did: null } });
    expect(issues).toEqual([
      expect.objectContaining({ lineIndex: 2, code: 'no_numbers_available' }),
    ]);
  });

  it('rejects drafts that refer to unknown sites or users, or a full extension range', () => {
    const run = (lines: Parameters<typeof resolveDraft>[0]['lines']) => () =>
      resolveDraft({ lines }, testContext());
    expect(run([add({ siteId: 'site_x' })])).toThrow(ValidationFailedError);
    expect(run([{ action: 'remove_user', userId: 'nope' }])).toThrow(ValidationFailedError);
    const full = Array.from({ length: 5 }, (_, i) => add({ email: `p${i}@test.example.com` }));
    try {
      resolveDraft({ lines: full }, testContext());
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationFailedError).details).toEqual({
        issues: [expect.objectContaining({ lineIndex: 4, code: 'no_extensions_available' })],
      });
    }
  });

  it('builds before/after for updates; a new device drops the old MAC', () => {
    const { lines } = resolveDraft(
      { lines: [{ action: 'update_user', userId: 'u2', changes: { deviceModel: 'softphone' } }] },
      testContext(),
    );
    expect(lines[0]).toMatchObject({
      action: 'update_user',
      before: { deviceModel: 'desk-d400', macAddress: '02:00:00:00:00:02' },
      after: { deviceModel: 'softphone', macAddress: null },
    });
  });
});

describe('validateLines', () => {
  const ctx = testContext();
  const resolved = (overrides: Partial<UserSnapshot> = {}): ResolvedLine => ({
    action: 'add_user',
    user: {
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya@test.example.com',
      siteId: 'site_k',
      extension: '2101',
      did: '+16135550102',
      voicemail: true,
      deviceModel: null,
      macAddress: null,
      ...overrides,
    },
  });

  it('accepts a clean line', () => {
    expect(validateLines([resolved()], ctx)).toEqual([]);
  });

  it.each([
    [{ siteId: 'site_x' }, 'site_not_found'],
    [{ extension: '2199' }, 'extension_out_of_range'],
    [{ extension: '2100' }, 'extension_in_use'],
    [{ did: '+16135550199' }, 'number_not_found'],
    [{ did: '+16135550151' }, 'number_wrong_site'],
    [{ did: '+16135550100' }, 'number_unavailable'],
    [{ email: 'U1@test.example.com' }, 'email_in_use'],
    [{ deviceModel: 'phone-9000' }, 'device_not_found'],
    [{ deviceModel: 'softphone', macAddress: '02:00:00:00:00:09' }, 'mac_not_applicable'],
    [{ deviceModel: null, macAddress: '02:00:00:00:00:09' }, 'mac_without_device'],
    [{ deviceModel: 'desk-d200', macAddress: '02:00:00:00:00:02' }, 'mac_in_use'],
  ])('flags %o as %s', (user, code) => {
    const issues = validateLines([resolved(user)], ctx);
    expect(issues).toContainEqual(
      expect.objectContaining({ lineIndex: 0, code, severity: 'error' }),
    );
  });

  it('warns about a hardware phone without a MAC and an off-domain email', () => {
    const issues = validateLines(
      [resolved({ deviceModel: 'desk-d200', email: 'priya@gmail.com' })],
      ctx,
    );
    expect(issues.map((i) => [i.code, i.severity])).toEqual([
      ['email_domain', 'warning'],
      ['mac_missing', 'warning'],
    ]);
  });

  it('catches duplicates inside one order', () => {
    const mac = { deviceModel: 'desk-d200', macAddress: '02:00:00:00:00:07' };
    const issues = validateLines([resolved(mac), resolved(mac)], ctx);
    expect(codes(issues.filter((i) => i.lineIndex === 1))).toEqual([
      'extension_duplicate',
      'number_duplicate',
      'email_duplicate',
      'mac_duplicate',
    ]);
  });

  it('blocks every order on a suspended account', () => {
    const issues = validateLines(
      [resolved()],
      testContext({ account: account({ status: 'suspended' }) }),
    );
    expect(issues[0]).toMatchObject({ lineIndex: null, code: 'account_suspended' });
  });

  it('checks update and remove targets', () => {
    const u1 = ctx.users[0]!;
    const before = toSnapshot(u1);
    const busy = testContext({ users: [user({ ...u1, pendingOrderId: 'ord_other' })] });
    expect(codes(validateLines([{ action: 'remove_user', userId: 'u1', before }], busy))).toEqual([
      'user_busy',
    ]);
    // The order that holds the lock may re-validate its own line.
    expect(
      validateLines([{ action: 'remove_user', userId: 'u1', before }], busy, {
        orderId: 'ord_other',
      }),
    ).toEqual([]);

    const stale = { ...before, voicemail: !before.voicemail };
    expect(
      codes(validateLines([{ action: 'remove_user', userId: 'u1', before: stale }], ctx)),
    ).toEqual(['stale_preview']);
    expect(
      codes(
        validateLines(
          [
            {
              action: 'update_user',
              userId: 'u1',
              before,
              after: { ...before, extension: '2105' },
            },
          ],
          ctx,
        ),
      ),
    ).toEqual(['unsupported_change']);
    expect(
      validateLines([{ action: 'update_user', userId: 'u1', before, after: before }], ctx)[0],
    ).toMatchObject({
      code: 'no_changes',
      severity: 'warning',
    });
    expect(
      codes(
        validateLines(
          [
            { action: 'remove_user', userId: 'u1', before },
            { action: 'update_user', userId: 'u1', before, after: { ...before, voicemail: false } },
          ],
          ctx,
        ),
      ),
    ).toEqual(['duplicate_user']);
  });

  it('lets an order re-validate resources it already holds', () => {
    const held = testContext();
    held.numbers.find((n) => n.e164 === '+16135550102')!.status = 'reserved';
    held.numbers.find((n) => n.e164 === '+16135550102')!.orderId = 'ord_1';
    expect(codes(validateLines([resolved()], held))).toEqual(['number_unavailable']);
    expect(validateLines([resolved()], held, { orderId: 'ord_1' })).toEqual([]);

    const ownMac = { deviceModel: 'desk-d400', macAddress: '02:00:00:00:00:02' };
    const retried = { ...resolved(ownMac), userId: 'u2' } as ResolvedLine;
    expect(validateLines([retried], testContext({ users: [] }))).toEqual([]);
  });
});

describe('previewOrder', () => {
  it('summarises the resolved lines and is valid only without errors', () => {
    const preview = previewOrder(
      {
        lines: [
          add({ deviceModel: 'desk-d200' }),
          { action: 'update_user', userId: 'u1', changes: { voicemail: false } },
          { action: 'remove_user', userId: 'u3' },
        ],
      },
      testContext(),
    );
    expect(preview.summary).toEqual({ adds: 1, updates: 1, removes: 1 });
    expect(preview.valid).toBe(true);
    expect(preview.issues).toEqual([
      expect.objectContaining({ code: 'mac_missing', severity: 'warning' }),
    ]);

    const invalid = previewOrder({ lines: [add({ email: 'u1@test.example.com' })] }, testContext());
    expect(invalid.valid).toBe(false);
  });
});
