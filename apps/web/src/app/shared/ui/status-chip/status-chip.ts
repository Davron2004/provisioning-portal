import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AnyStatus, statusStyle } from './status';

/**
 * A status as color, icon and text together, so it never relies on color alone.
 *
 *   <app-status-chip [status]="order.status" />
 *   <app-status-chip [status]="line.status" label="Retrying" />
 */
@Component({
  selector: 'app-status-chip',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'app-status-chip',
    '[attr.data-tone]': 'style().tone',
    '[class.app-status-chip--busy]': 'style().busy',
  },
  template: `
    <mat-icon class="icon" [svgIcon]="style().icon" aria-hidden="true" />
    <span class="label">{{ label() ?? style().label }}</span>
  `,
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly status = input.required<AnyStatus>();
  /** Overrides the default text, e.g. to add a count. */
  readonly label = input<string>();

  protected readonly style = computed(() => statusStyle(this.status()));
}
