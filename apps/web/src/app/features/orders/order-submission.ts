import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { OrderPreview, OrderSource } from '@provisioning/contracts';
import { finalize } from 'rxjs';
import { OrdersApi } from '../../core/api/orders-api';
import { NotificationService } from '../../core/notifications/notification';

export interface SubmitOptions {
  readonly source: OrderSource;
  /** The plain-English request, for orders that came from the assistant. */
  readonly prompt: string | null;
}

/**
 * Submits a reviewed preview and opens the new order. Provide it on the page:
 * `providers: [OrderSubmission]`.
 *
 * Each preview gets one idempotency key, used for every attempt to submit it: if a
 * submit times out after the server accepted it, trying again returns the same order
 * instead of provisioning twice. A new preview (after editing) gets a new key.
 */
@Injectable()
export class OrderSubmission {
  private readonly ordersApi = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly keys = new WeakMap<OrderPreview, string>();

  private readonly submittingState = signal(false);
  private readonly errorState = signal<unknown>(null);
  readonly submitting = this.submittingState.asReadonly();
  /** Why the last submit failed; cleared by the next attempt or `reset()`. */
  readonly error = this.errorState.asReadonly();

  keyFor(preview: OrderPreview): string {
    let key = this.keys.get(preview);
    if (!key) {
      key = crypto.randomUUID();
      this.keys.set(preview, key);
    }
    return key;
  }

  submit(preview: OrderPreview, { source, prompt }: SubmitOptions): void {
    if (this.submittingState() || !preview.valid) {
      return;
    }
    this.submittingState.set(true);
    this.errorState.set(null);
    this.ordersApi
      .create(preview.accountId, {
        lines: preview.lines,
        source,
        prompt,
        idempotencyKey: this.keyFor(preview),
      })
      .pipe(
        finalize(() => this.submittingState.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (order) => {
          this.notifications.success('Order submitted. Provisioning starts in a moment.');
          void this.router.navigate(['/accounts', order.accountId, 'orders', order.id]);
        },
        error: (error: unknown) => this.errorState.set(error),
      });
  }

  reset(): void {
    this.errorState.set(null);
  }
}
