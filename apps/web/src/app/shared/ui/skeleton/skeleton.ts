import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Placeholder shapes while data loads. Decorative: wrap the loading region in
 * an element with `aria-busy="true"` so assistive tech knows content is coming.
 *
 *   <app-skeleton />                         one line of text
 *   <app-skeleton [lines]="3" />             a paragraph (last line shorter)
 *   <app-skeleton height="120px" />          a block, e.g. a card or chart
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @for (line of rows(); track $index; let last = $last) {
      <span
        class="bone"
        [style.height]="height()"
        [style.width]="last && rows().length > 1 ? '60%' : width()"
      ></span>
    }
  `,
  styleUrl: './skeleton.scss',
})
export class Skeleton {
  readonly lines = input(1);
  readonly width = input('100%');
  /** Defaults to one line of body text. */
  readonly height = input('1em');

  protected readonly rows = computed(() => Array.from({ length: Math.max(1, this.lines()) }));
}
