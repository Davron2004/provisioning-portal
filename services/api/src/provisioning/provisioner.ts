import type { ResolvedLine } from '@provisioning/contracts';

/**
 * The boundary to the systems that actually deliver phone service: the
 * carrier (numbers), the call server (extensions, voicemail) and device
 * configuration. This project has no real carrier or call server, so the only
 * implementation is SimulatedProvisioner; a real one would implement the same
 * two methods.
 */
export interface Provisioner {
  /** The human-readable steps a line goes through, in order. Shown live in the UI. */
  plan(line: ResolvedLine): string[];
  runStep(step: string, context: StepContext): Promise<void>;
}

export interface StepContext {
  line: ResolvedLine;
  orderId: string;
  lineId: string;
  /** 1 for the first attempt of this line, 2 for the first retry, and so on. */
  attempt: number;
}

/**
 * A failure that is worth retrying (timeouts, busy upstreams). The state
 * machine retries it per PROVISION_LINE_RETRY; `name` is what Step Functions
 * matches in `ErrorEquals`.
 */
export class ProvisioningTransientError extends Error {
  override readonly name = 'ProvisioningTransientError';
}

/** A failure that retrying will not fix (rejected configuration). Not retried. */
export class ProvisioningPermanentError extends Error {
  override readonly name = 'ProvisioningPermanentError';
}
