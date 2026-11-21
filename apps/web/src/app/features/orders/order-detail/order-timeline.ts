import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { OrderEvent } from '@provisioning/contracts';
import { RelativeTime } from '../../../shared/ui/relative-time/relative-time';
import { statusStyle } from '../../../shared/ui/status-chip/status';

/**
 * The order's event log, oldest first: status changes stand out with their status
 * icon and color (a step that started shows a ring); line events (a line provisioned, retried or failed) sit between them.
 */
@Component({
  selector: 'app-order-timeline',
  imports: [MatIconModule, RelativeTime],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="events">
      @for (item of items(); track $index) {
        <li [attr.data-tone]="item.tone" [class.status]="item.icon">
          <span class="marker" aria-hidden="true">
            @if (item.icon) {
              <mat-icon [svgIcon]="item.icon" />
            }
          </span>
          <span class="message">{{ item.event.message }}</span>
          <app-relative-time class="at" [value]="item.event.at" />
        </li>
      }
    </ol>
  `,
  styles: `
    .events {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      --_tone: var(--mat-sys-outline);
      position: relative;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--app-space-3);
      padding-bottom: var(--app-space-4);
      font: var(--mat-sys-body-medium);
    }
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      top: 24px;
      bottom: 0;
      left: 11px;
      width: 2px;
      background: var(--mat-sys-outline-variant);
    }
    li[data-tone='success'] {
      --_tone: var(--app-status-success-accent);
    }
    li[data-tone='info'] {
      --_tone: var(--app-status-info-accent);
    }
    li[data-tone='error'] {
      --_tone: var(--app-status-error-accent);
    }
    li[data-tone='neutral'] {
      --_tone: var(--app-status-neutral-accent);
    }
    .marker {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
    }
    li:not(.status) .marker::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-outline);
    }
    .marker mat-icon {
      width: 20px;
      height: 20px;
      color: var(--_tone);
    }
    .message {
      padding-top: 2px;
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .status .message {
      color: var(--mat-sys-on-surface);
      font-weight: 500;
    }
    .at {
      padding-top: 2px;
      font: var(--mat-sys-body-small);
      line-height: 20px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class OrderTimeline {
  readonly events = input.required<readonly OrderEvent[]>();

  protected readonly items = computed(() =>
    this.events().map((event) => {
      const style = event.status ? statusStyle(event.status) : null;
      // A log is history: a step that started gets a ring, not the spinner it has live.
      const icon = style ? (style.busy ? 'radio_button_unchecked' : style.icon) : null;
      return { event, icon, tone: style?.tone ?? null };
    }),
  );
}
