import { Pipe, PipeTransform, inject } from '@angular/core';
import { Clock } from '../time/clock';
import { DateInput, formatRelativeTime } from '../time/format-time';

/**
 * `{{ order.updatedAt | relativeTime }}` -> "3 min ago", kept fresh by the Clock.
 * Prefer `<app-relative-time>` in the UI: it adds the absolute time on hover and
 * a machine-readable <time datetime>.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly clock = inject(Clock);

  transform(value: DateInput | null | undefined): string {
    return value === null || value === undefined ? '' : formatRelativeTime(value, this.clock.now());
  }
}
