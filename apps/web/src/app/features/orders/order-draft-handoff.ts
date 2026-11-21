import { Injectable } from '@angular/core';
import { OrderDraft } from '@provisioning/contracts';

/** A draft the assistant passes to the order builder ("Edit in order builder"). */
export interface DraftHandoff {
  readonly accountId: string;
  readonly draft: OrderDraft;
  /** The plain-English request it came from; the submitted order keeps it. */
  readonly prompt: string;
}

/**
 * Carries one draft from the assistant to the order builder of the same account.
 * In memory on purpose: a reload of the builder starts a fresh order.
 */
@Injectable({ providedIn: 'root' })
export class OrderDraftHandoff {
  private pending: DraftHandoff | null = null;

  put(handoff: DraftHandoff): void {
    this.pending = handoff;
  }

  /** The draft handed over for this account, once; later calls return null. */
  take(accountId: string): DraftHandoff | null {
    const handoff = this.pending?.accountId === accountId ? this.pending : null;
    this.pending = null;
    return handoff;
  }
}
