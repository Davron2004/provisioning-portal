import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

/**
 * Placeholder for a mat-table while its first page loads: the same header band and
 * row height as `.app-table`, so nothing moves when the rows arrive.
 *
 *   <app-table-skeleton [columns]="[3, 1, 1, 2]" label="Loading accounts" />
 */
@Component({
  selector: 'app-table-skeleton',
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', '[attr.aria-label]': 'label()' },
  template: `
    <div class="row header" [style.grid-template-columns]="template()">
      @for (column of columns(); track $index) {
        <app-skeleton width="48px" height="10px" />
      }
    </div>
    @for (row of rowList(); track $index) {
      <div class="row" [style.grid-template-columns]="template()">
        @for (column of columns(); track $index; let first = $first) {
          <app-skeleton [width]="first ? '70%' : '50%'" />
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: grid;
      align-items: center;
      gap: var(--app-space-6);
      block-size: 56px;
      padding: 0 var(--app-space-5);
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .header {
      block-size: 44px;
      border-top: 0;
      background: var(--mat-sys-surface-container-low);
    }
  `,
})
export class TableSkeleton {
  /** Relative widths of the columns, as `fr` units. */
  readonly columns = input<readonly number[]>([3, 1, 1, 1]);
  readonly rows = input(6);
  readonly label = input('Loading');

  protected readonly template = computed(() =>
    this.columns()
      .map((fr) => `minmax(0, ${fr}fr)`)
      .join(' '),
  );
  protected readonly rowList = computed(() => Array.from({ length: this.rows() }));
}
