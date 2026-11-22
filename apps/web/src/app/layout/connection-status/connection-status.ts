import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConnectionState, RealtimeService } from '../../core/realtime/realtime';

const COPY: Record<ConnectionState, { label: string; detail: string }> = {
  live: { label: 'Live', detail: 'Order updates arrive as they happen.' },
  connecting: { label: 'Connecting', detail: 'Connecting to live order updates.' },
  reconnecting: {
    label: 'Reconnecting',
    detail: 'Live updates are interrupted. Retrying; data on screen may be out of date.',
  },
  offline: { label: 'Offline', detail: 'Live order updates are off.' },
};

/** The longest label: an invisible copy of the pill reserves its width. */
const WIDEST_LABEL = Object.values(COPY)
  .map((copy) => copy.label)
  .reduce((widest, label) => (label.length > widest.length ? label : widest));

/**
 * Small "Live" / "Reconnecting" indicator for the realtime connection. It always takes
 * the width of its longest label, with the pill at the end, so going from "Connecting"
 * to "Live" does not move anything else in the toolbar.
 */
@Component({
  selector: 'app-connection-status',
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.data-state]': 'realtime.state()',
    '[class.compact]': 'compact()',
  },
  template: `
    <span class="pill sizer" aria-hidden="true">
      <span class="dot"></span>
      <span class="label">{{ widestLabel }}</span>
    </span>
    <span class="pill" tabindex="0" [matTooltip]="copy().detail">
      <span class="dot" aria-hidden="true"></span>
      <span class="label">{{ copy().label }}</span>
    </span>
  `,
  styleUrl: './connection-status.scss',
})
export class ConnectionStatus {
  protected readonly realtime = inject(RealtimeService);
  /** Dot only (the label stays available to screen readers). */
  readonly compact = input(false);
  protected readonly copy = computed(() => COPY[this.realtime.state()]);
  protected readonly widestLabel = WIDEST_LABEL;
}
