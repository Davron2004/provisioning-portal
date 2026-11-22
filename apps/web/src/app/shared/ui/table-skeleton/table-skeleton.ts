import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../layout/media-query';
import { Skeleton } from '../skeleton/skeleton';

/**
 * Placeholder for a list while its first page loads: in a table card, the same header
 * band and row height as `.app-table`; on a phone, where lists are cards, cards
 * (`.app-card-list`). So the shape does not change when the rows arrive.
 *
 *   <app-table-skeleton [columns]="[3, 1, 1, 2]" label="Loading accounts" />
 *
 * It draws its own card (or cards), so it takes no `app-table-card` class.
 */
@Component({
  selector: 'app-table-skeleton',
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.aria-label]': 'label()',
    '[class.app-table-card]': '!handset()',
    '[class.app-card-list]': 'handset()',
  },
  template: `
    @if (handset()) {
      @for (row of cardList(); track $index) {
        <div class="app-card">
          <div class="card-top">
            <app-skeleton width="55%" height="20px" />
            <app-skeleton width="72px" height="24px" />
          </div>
          <app-skeleton width="80%" />
          <app-skeleton width="60%" />
        </div>
      }
    } @else {
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
    }
  `,
  styles: `
    /* As cards, the shared .app-card-list styles lay it out. */
    :host(:not(.app-card-list)) {
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
      background: var(--app-surface-card-muted);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      gap: var(--app-space-3);
    }
    .card-top app-skeleton:first-child {
      flex: 1;
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
  /** Cards are taller than rows: fewer of them fill the same screen. */
  protected readonly cardList = computed(() => Array.from({ length: Math.ceil(this.rows() / 2) }));
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);
}
