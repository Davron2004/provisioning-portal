import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OrderLine } from '@provisioning/contracts';

/**
 * What a line is doing right now: the provisioning step with a quiet pulse while it
 * runs, the error when it failed, or a short word otherwise.
 */
@Component({
  selector: 'app-line-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-status]': 'line().status' },
  template: `
    @let l = line();
    @switch (l.status) {
      @case ('provisioning') {
        <span class="pulse" aria-hidden="true"></span>
        <span>{{ l.step ?? 'Starting' }}</span>
      }
      @case ('failed') {
        <span class="error">{{ l.error ?? 'Failed' }}</span>
      }
      @case ('succeeded') {
        <span class="muted">Done</span>
      }
      @default {
        <span class="muted">Waiting</span>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: baseline;
      gap: var(--app-space-2);
      min-width: 0;
    }
    .pulse {
      flex: none;
      align-self: center;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--app-status-info-accent);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .error {
      color: var(--app-status-error-fg);
      overflow-wrap: anywhere;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.35;
        transform: scale(0.7);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse {
        animation: none;
      }
    }
  `,
})
export class LineStep {
  readonly line = input.required<OrderLine>();
}
