import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

/** At or above this share the meter turns to the warning tone: the pool is nearly used up. */
export const HIGH_UTILIZATION = 0.9;

/**
 * How much of a pool is in use, e.g. numbers assigned out of an account's inventory.
 * A bar and the figures beside it; the bar alone is never the only cue.
 *
 *   <app-utilization-meter [used]="38" [total]="45" label="Numbers in use" />
 */
@Component({
  selector: 'app-utilization-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': 'compact()',
    '[attr.data-level]': 'level()',
  },
  template: `
    <span
      class="track"
      role="meter"
      aria-valuemin="0"
      [attr.aria-valuemax]="total()"
      [attr.aria-valuenow]="used()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-label]="label()"
    >
      <span class="fill" [style.inline-size.%]="percent()"></span>
    </span>
    <span class="figures app-numeric" aria-hidden="true">
      @if (compact()) {
        {{ used() }}/{{ total() }}
        @if (unit()) {
          <span class="unit">{{ unit() }}</span>
        }
      } @else {
        <strong>{{ used() }}</strong> of {{ total() }} · {{ percentText() }}
      }
    </span>
  `,
  styles: `
    :host {
      --_fill: var(--mat-sys-primary);
      --_track: color-mix(in srgb, var(--mat-sys-primary) 16%, transparent);

      display: flex;
      flex-direction: column;
      gap: var(--app-space-2);
      min-inline-size: 0;
    }
    :host([data-level='high']) {
      --_fill: var(--app-status-warning-accent);
      --_track: color-mix(in srgb, var(--app-status-warning-accent) 20%, transparent);
    }
    :host(.compact) {
      flex-direction: row;
      align-items: center;
      gap: var(--app-space-3);
    }
    .track {
      display: block;
      block-size: 8px;
      border-radius: var(--app-radius-full);
      background: var(--_track);
      overflow: hidden;
    }
    :host(.compact) .track {
      flex: 0 0 64px;
      block-size: 6px;
    }
    .fill {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      border-radius: inherit;
      background: var(--_fill);
      transition: inline-size var(--app-duration-medium) var(--app-ease-standard);
    }
    .figures {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    :host(.compact) .figures {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
    }
    .unit {
      color: var(--mat-sys-on-surface-variant);
    }
    strong {
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class UtilizationMeter {
  readonly used = input.required<number>();
  readonly total = input.required<number>();
  /** Accessible name of the meter, e.g. "Numbers in use". */
  readonly label = input.required<string>();
  /** Words after the compact figures, e.g. "numbers in use", where no header names them. */
  readonly unit = input<string>();
  /** One line, figures as "38/45": for table cells and cards. */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly ratio = computed(() => {
    const total = this.total();
    return total > 0 ? Math.min(1, Math.max(0, this.used() / total)) : 0;
  });
  protected readonly percent = computed(() => Math.round(this.ratio() * 1000) / 10);
  protected readonly percentText = computed(() => `${Math.round(this.ratio() * 100)}%`);
  protected readonly level = computed(() => (this.ratio() >= HIGH_UTILIZATION ? 'high' : 'normal'));
  protected readonly valueText = computed(
    () => `${this.used()} of ${this.total()} in use, ${this.percentText()}`,
  );
}
