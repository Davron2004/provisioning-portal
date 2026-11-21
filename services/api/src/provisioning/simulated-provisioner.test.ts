import { describe, expect, it } from 'vitest';
import type { ResolvedLine, UserSnapshot } from '@provisioning/contracts';
import { seededRandom } from '../lib/random';
import { ProvisioningPermanentError, ProvisioningTransientError } from './provisioner';
import { SimulatedProvisioner, STEPS, simulatedProvisionerFromEnv } from './simulated-provisioner';

const person = (overrides: Partial<UserSnapshot> = {}): UserSnapshot => ({
  firstName: 'Priya',
  lastName: 'Shah',
  email: 'priya@test.example.com',
  siteId: 'site_k',
  extension: '2101',
  did: '+16135550102',
  voicemail: true,
  deviceModel: 'desk-d400',
  macAddress: '02:00:00:00:00:07',
  ...overrides,
});
const add = (overrides: Partial<UserSnapshot> = {}): ResolvedLine => ({
  action: 'add_user',
  user: person(overrides),
});

function simulator(rate = 0, seed = 1) {
  const delays: number[] = [];
  const provisioner = new SimulatedProvisioner({
    transientFailureRate: rate,
    stepDelayMs: { min: 1000, max: 3000 },
    random: seededRandom(seed),
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  return { provisioner, delays };
}

async function run(provisioner: SimulatedProvisioner, line: ResolvedLine, attempt = 1) {
  for (const step of provisioner.plan(line)) {
    await provisioner.runStep(step, { line, orderId: 'ord_1', lineId: 'line-1', attempt });
  }
}

describe('SimulatedProvisioner', () => {
  const { provisioner } = simulator();

  it('plans the steps a line actually needs', () => {
    expect(provisioner.plan(add())).toEqual([
      STEPS.reserveNumber,
      STEPS.createExtension,
      STEPS.createVoicemail,
      STEPS.pushDeviceConfig,
    ]);
    expect(
      provisioner.plan(
        add({ did: null, voicemail: false, deviceModel: 'softphone', macAddress: null }),
      ),
    ).toEqual([STEPS.createExtension, STEPS.inviteSoftphone]);
    // A desk phone without a MAC cannot be configured yet, so there is no device step.
    expect(provisioner.plan(add({ macAddress: null }))).not.toContain(STEPS.pushDeviceConfig);
    expect(
      provisioner.plan({
        action: 'update_user',
        userId: 'u',
        before: person(),
        after: person({ voicemail: false }),
      }),
    ).toEqual([STEPS.removeVoicemail]);
    expect(
      provisioner.plan({
        action: 'update_user',
        userId: 'u',
        before: person(),
        after: person({ deviceModel: 'dect-h300', macAddress: null }),
      }),
    ).toEqual([STEPS.removeDeviceConfig, STEPS.registerHandset]);
    expect(provisioner.plan({ action: 'remove_user', userId: 'u', before: person() })).toEqual([
      STEPS.removeDeviceConfig,
      STEPS.removeVoicemail,
      STEPS.deleteExtension,
      STEPS.releaseNumber,
    ]);
  });

  it('waits a realistic time per step', async () => {
    const { provisioner, delays } = simulator();
    await run(provisioner, add());
    expect(delays).toHaveLength(4);
    for (const ms of delays) {
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(3000);
    }
  });

  it('fails permanently for +fail addresses, with a realistic message', async () => {
    await expect(run(provisioner, add({ email: 'x+fail@test.example.com' }))).rejects.toThrow(
      new ProvisioningPermanentError(
        'Call server rejected extension 2101: conflicts with a hunt group in the dial plan',
      ),
    );
  });

  it('fails once transiently for +flaky addresses, then succeeds', async () => {
    const line = add({ email: 'x+flaky@test.example.com' });
    await expect(run(provisioner, line, 1)).rejects.toBeInstanceOf(ProvisioningTransientError);
    await expect(run(provisioner, line, 2)).resolves.toBeUndefined();
  });

  it('fails transiently at roughly the configured rate, deterministically per seed', async () => {
    const outcomes = async (seed: number) => {
      const { provisioner } = simulator(0.25, seed);
      let failures = 0;
      for (let i = 0; i < 400; i++) {
        try {
          await run(provisioner, add());
        } catch (error) {
          expect(error).toBeInstanceOf(ProvisioningTransientError);
          failures += 1;
        }
      }
      return failures;
    };
    const failures = await outcomes(42);
    expect(failures / 400).toBeGreaterThan(0.18);
    expect(failures / 400).toBeLessThan(0.32);
    expect(await outcomes(42)).toBe(failures);
  });

  it('reads its settings from the environment', () => {
    expect(() => simulatedProvisionerFromEnv({ PROVISIONING_TRANSIENT_FAILURE_RATE: '2' })).toThrow(
      /between 0 and 1/,
    );
    expect(
      simulatedProvisionerFromEnv({
        PROVISIONING_STEP_DELAY_MS: '0',
        PROVISIONING_TRANSIENT_FAILURE_RATE: '0',
      }),
    ).toBeInstanceOf(SimulatedProvisioner);
  });
});
