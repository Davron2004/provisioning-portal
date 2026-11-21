import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { highlightParts } from './highlight';

/** A search highlight as text and <mark>s; see highlightParts for why not innerHTML. */
@Component({
  selector: 'app-highlighted-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // One line on purpose: whitespace between the parts would show up in the text.
  // prettier-ignore
  template: `@for (part of parts(); track $index) {@if (part.mark) {<mark>{{ part.text }}</mark>} @else {<span>{{ part.text }}</span>}}`,
  styles: `
    mark {
      padding: 0 1px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--mat-sys-tertiary) 22%, transparent);
      color: inherit;
      font-weight: 600;
    }
  `,
})
export class HighlightedText {
  readonly fragment = input.required<string>();
  protected readonly parts = computed(() => highlightParts(this.fragment()));
}
