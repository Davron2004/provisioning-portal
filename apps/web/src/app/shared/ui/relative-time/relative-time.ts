import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { DateInput, formatAbsoluteTime } from '../../time/format-time';

/** "3 min ago", with the exact time on hover/focus and in `datetime`. */
@Component({
  selector: 'app-relative-time',
  imports: [MatTooltipModule, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <time [attr.datetime]="iso()" [matTooltip]="absolute()" [attr.aria-label]="absolute()">{{
      value() | relativeTime
    }}</time>
  `,
  styles: `
    time {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class RelativeTime {
  readonly value = input.required<DateInput>();

  protected readonly iso = computed(() => {
    const date = new Date(this.value());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  });
  protected readonly absolute = computed(() => formatAbsoluteTime(this.value()));
}
