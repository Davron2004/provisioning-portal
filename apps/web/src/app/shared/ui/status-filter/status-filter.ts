import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { AnyStatus, statusStyle } from '../status-chip/status';

/**
 * The status filter above a list: "All" plus one chip per status, single choice.
 * Every list filters by status the same way (orders, an account's orders, numbers).
 *
 *   <app-status-filter label="Status" [statuses]="statuses" [value]="status()"
 *                      (valueChange)="setStatus($event)" />
 */
@Component({
  selector: 'app-status-filter',
  imports: [MatChipsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-chip-listbox
      [attr.aria-label]="label()"
      [value]="value() ?? ''"
      (change)="valueChange.emit($event.value || null)"
      hideSingleSelectionIndicator
    >
      <mat-chip-option value="">All</mat-chip-option>
      @for (option of options(); track option.value) {
        <mat-chip-option [value]="option.value">{{ option.label }}</mat-chip-option>
      }
    </mat-chip-listbox>
  `,
})
export class StatusFilter {
  /** Accessible name of the group, e.g. "Status". */
  readonly label = input.required<string>();
  readonly statuses = input.required<readonly AnyStatus[]>();
  /** The selected status, or null for all. */
  readonly value = input<string | null>(null);
  readonly valueChange = output<string | null>();

  protected readonly options = computed(() =>
    this.statuses().map((value) => ({ value, label: statusStyle(value).label })),
  );
}
