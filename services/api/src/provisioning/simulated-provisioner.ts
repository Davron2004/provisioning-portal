import type { ResolvedLine, UserSnapshot } from '@provisioning/contracts';
import { findDevice } from '../domain/catalog';
import { lineSubject } from '../domain/snapshots';
import { pick, type Random } from '../lib/random';
import {
  ProvisioningPermanentError,
  ProvisioningTransientError,
  type Provisioner,
  type StepContext,
} from './provisioner';

/**
 * SIMULATED provisioning. There is no carrier or call server behind this
 * project; each step waits a realistic amount of time and then succeeds,
 * fails transiently at a configurable rate, or follows a deterministic
 * trigger in the user's email address:
 *
 *   name+fail@...   the line fails permanently with a realistic error
 *   name+flaky@...  the first attempt fails transiently, the retry succeeds
 *
 * The triggers exist so tests and demos can show failure and retry on demand.
 */
export interface SimulationOptions {
  /** Chance that one attempt of a line hits a transient error (0..1). */
  transientFailureRate: number;
  /** Per-step delay range in milliseconds. */
  stepDelayMs: { min: number; max: number };
  random: Random;
  sleep: (ms: number) => Promise<void>;
}

export const STEPS = {
  reserveNumber: 'Reserving number with carrier',
  createExtension: 'Creating extension on call server',
  createVoicemail: 'Creating voicemail box',
  removeVoicemail: 'Removing voicemail box',
  pushDeviceConfig: 'Pushing device configuration',
  registerHandset: 'Registering handset with DECT base station',
  inviteSoftphone: 'Sending softphone invitation',
  removeDeviceConfig: 'Removing device configuration',
  deleteExtension: 'Deleting extension on call server',
  releaseNumber: 'Releasing number to carrier',
} as const;

const TRANSIENT_ERRORS = [
  'Carrier API timed out',
  'Call server is busy (503)',
  'Device configuration service did not respond',
];

export class SimulatedProvisioner implements Provisioner {
  constructor(private readonly options: SimulationOptions) {}

  plan(line: ResolvedLine): string[] {
    switch (line.action) {
      case 'add_user': {
        const u = line.user;
        return [
          ...(u.did ? [STEPS.reserveNumber] : []),
          STEPS.createExtension,
          ...(u.voicemail ? [STEPS.createVoicemail] : []),
          ...deviceSetupSteps(u),
        ];
      }
      case 'update_user': {
        const { before, after } = line;
        const deviceChanged =
          before.deviceModel !== after.deviceModel || before.macAddress !== after.macAddress;
        return [
          ...(before.voicemail !== after.voicemail
            ? [after.voicemail ? STEPS.createVoicemail : STEPS.removeVoicemail]
            : []),
          ...(deviceChanged && before.deviceModel ? [STEPS.removeDeviceConfig] : []),
          ...(deviceChanged ? deviceSetupSteps(after) : []),
        ];
      }
      case 'remove_user': {
        const u = line.before;
        return [
          ...(u.deviceModel ? [STEPS.removeDeviceConfig] : []),
          ...(u.voicemail ? [STEPS.removeVoicemail] : []),
          STEPS.deleteExtension,
          ...(u.did ? [STEPS.releaseNumber] : []),
        ];
      }
    }
  }

  async runStep(step: string, context: StepContext): Promise<void> {
    const { min, max } = this.options.stepDelayMs;
    await this.options.sleep(min + Math.floor(this.options.random() * (max - min + 1)));

    const subject = lineSubject(context.line);
    const tag = emailTag(subject.email);
    const steps = this.plan(context.line);
    const position = steps.indexOf(step);

    // Deterministic triggers first, so tests never depend on the random rate.
    if (tag === 'fail' && position === Math.min(1, steps.length - 1)) {
      throw new ProvisioningPermanentError(permanentError(step, subject));
    }
    if (tag === 'flaky' && context.attempt === 1 && position === 0) {
      throw new ProvisioningTransientError(TRANSIENT_ERRORS[0]!);
    }
    if (tag === null && steps.length > 0) {
      // Spread the per-attempt rate over the steps so long plans are not penalised.
      const perStep = 1 - (1 - this.options.transientFailureRate) ** (1 / steps.length);
      if (this.options.random() < perStep) {
        throw new ProvisioningTransientError(pick(this.options.random, TRANSIENT_ERRORS));
      }
    }
  }
}

function deviceSetupSteps(u: UserSnapshot): string[] {
  const device = findDevice(u.deviceModel);
  if (!device) return [];
  if (device.kind === 'softphone') return [STEPS.inviteSoftphone];
  if (device.kind === 'dect') return [STEPS.registerHandset];
  // Hardware without a MAC is provisioned without device configuration (preview warns).
  return u.macAddress ? [STEPS.pushDeviceConfig] : [];
}

/** `priya+fail@example.com` -> 'fail'. */
function emailTag(email: string): 'fail' | 'flaky' | null {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.includes('+fail')) return 'fail';
  if (local.includes('+flaky')) return 'flaky';
  return null;
}

function permanentError(step: string, u: UserSnapshot): string {
  switch (step) {
    case STEPS.reserveNumber:
      return `Carrier rejected the activation of ${u.did}: number is under port-out review`;
    case STEPS.createExtension:
      return `Call server rejected extension ${u.extension}: conflicts with a hunt group in the dial plan`;
    case STEPS.createVoicemail:
      return `Voicemail platform rejected the mailbox for ${u.email}: mailbox quota exceeded for the account`;
    case STEPS.removeVoicemail:
      return `Voicemail platform could not delete the mailbox for ${u.email}: it is on legal hold`;
    case STEPS.pushDeviceConfig:
      return `Device ${u.macAddress} is registered to another tenant on the configuration server`;
    case STEPS.deleteExtension:
      return `Call server refused to delete extension ${u.extension}: it is the target of an active call-forward rule`;
    default:
      return `${step} failed: the upstream system rejected the request`;
  }
}

/** Builds the simulator from PROVISIONING_TRANSIENT_FAILURE_RATE and PROVISIONING_STEP_DELAY_MS ("min-max"). */
export function simulatedProvisionerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SimulatedProvisioner {
  const rate = Number(env.PROVISIONING_TRANSIENT_FAILURE_RATE ?? 0.1);
  const [min, max] = (env.PROVISIONING_STEP_DELAY_MS ?? '1000-3000').split('-').map(Number);
  if (!(rate >= 0 && rate <= 1))
    throw new Error('PROVISIONING_TRANSIENT_FAILURE_RATE must be between 0 and 1');
  if (!Number.isFinite(min) || !Number.isFinite(max ?? min)) {
    throw new Error('PROVISIONING_STEP_DELAY_MS must look like 1000-3000');
  }
  return new SimulatedProvisioner({
    transientFailureRate: rate,
    stepDelayMs: { min: min!, max: max ?? min! },
    random: Math.random,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}
