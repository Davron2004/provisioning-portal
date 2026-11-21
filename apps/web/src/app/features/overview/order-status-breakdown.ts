import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderStatus } from '@provisioning/contracts';
import { statusStyle } from '../../shared/ui/status-chip/status';

/** Pipeline order, left to right in the bar. */
const STATUS_ORDER: readonly OrderStatus[] = [
  'submitted',
  'validating',
  'provisioning',
  'active',
  'failed',
];

/**
 * Orders by status: the total, a thin bar split by status, and one row per status
 * (dot, name, count) linking to the orders list filtered to it. The rows carry the
 * figures, so the bar needs no labels; its accessible name lists every part.
 */
@Component({
  selector: 'app-order-status-breakdown',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="total">
      <span class="total-value app-numeric">{{ breakdown().total }}</span>
      {{ breakdown().total === 1 ? 'order' : 'orders' }},
      <span class="app-numeric">{{ breakdown().inFlight }}</span> in progress
    </p>
    <div class="bar" role="img" [attr.aria-label]="summary()">
      @for (row of breakdown().rows; track row.status) {
        @if (row.count > 0) {
          <span class="segment" [attr.data-tone]="row.tone" [style.flex-grow]="row.count"></span>
        }
      }
    </div>
    <ul class="rows">
      @for (row of breakdown().rows; track row.status) {
        <li>
          <a class="row" routerLink="/orders" [queryParams]="{ status: row.status }">
            <span class="dot" [attr.data-tone]="row.tone" aria-hidden="true"></span>
            <span class="name">{{ row.label }}</span>
            <span class="count app-numeric">{{ row.count }}</span>
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--app-space-5) var(--app-space-5) var(--app-space-3);
    }
    .total {
      margin-bottom: var(--app-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .total-value {
      margin-right: var(--app-space-1);
      font: var(--mat-sys-headline-small);
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
    .bar {
      display: flex;
      gap: 2px;
      height: 8px;
      margin-bottom: var(--app-space-3);
      border-radius: var(--app-radius-full);
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;
    }
    .segment {
      flex: 1 1 0;
      min-width: 4px;
    }
    .segment,
    .dot {
      background: var(--app-status-neutral-accent);
      &[data-tone='success'] {
        background: var(--app-status-success-accent);
      }
      &[data-tone='info'] {
        background: var(--app-status-info-accent);
      }
      &[data-tone='error'] {
        background: var(--app-status-error-accent);
      }
    }
    .rows {
      margin: 0 calc(-1 * var(--app-space-3));
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--app-space-3);
      min-height: 44px;
      padding: 0 var(--app-space-3);
      border-radius: var(--app-radius-md);
      color: var(--mat-sys-on-surface);
      text-decoration: none;
      &:hover {
        background: var(--app-surface-card-muted);
      }
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: var(--app-radius-full);
    }
    .name {
      flex: 1;
    }
    .count {
      font-weight: 600;
    }
  `,
})
export class OrderStatusBreakdown {
  readonly counts = input.required<Readonly<Record<OrderStatus, number>>>();

  protected readonly breakdown = computed(() => {
    const counts = this.counts();
    const rows = STATUS_ORDER.map((status) => ({
      status,
      count: counts[status] ?? 0,
      label: statusStyle(status).label,
      tone: statusStyle(status).tone,
    }));
    return {
      rows,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      inFlight: counts.submitted + counts.validating + counts.provisioning,
    };
  });

  protected readonly summary = computed(() =>
    this.breakdown()
      .rows.map((row) => `${row.label}: ${row.count}`)
      .join(', '),
  );
}
