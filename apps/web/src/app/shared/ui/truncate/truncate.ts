import { Directive, ElementRef, inject } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * One line of text, cut with an ellipsis when it does not fit, with the full text in a
 * tooltip, only while it is actually cut (a name that fits gets no tooltip).
 *
 *   <span appTruncate>{{ user.email }}</span>
 *   <a class="app-row-link" appTruncate [routerLink]="...">{{ order.title }}</a>
 *
 * Overflow is measured when the pointer or keyboard focus arrives, so it follows
 * column resizes and live text changes without observers.
 */
@Directive({
  selector: '[appTruncate]',
  hostDirectives: [MatTooltip],
  host: {
    class: 'app-truncate',
    '(mouseenter)': 'reveal(false)',
    '(mouseleave)': 'tooltip.hide()',
    '(focusin)': 'reveal(true)',
    '(focusout)': 'tooltip.hide(0)',
  },
})
export class Truncate {
  private readonly element: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly tooltip = inject(MatTooltip);

  constructor() {
    this.tooltip.disabled = true;
  }

  /** True when the text is wider than the box it is cut to. */
  isTruncated(): boolean {
    return this.element.scrollWidth > this.element.clientWidth;
  }

  protected reveal(fromFocus: boolean): void {
    const truncated = this.isTruncated();
    this.tooltip.message = truncated ? (this.element.textContent ?? '') : '';
    this.tooltip.disabled = !truncated;
    // The tooltip's own listeners are only attached once it is enabled, too late for the
    // event that enabled it; show it for this one. Focus shows it only from the keyboard.
    if (truncated && (!fromFocus || this.element.matches(':focus-visible'))) {
      this.tooltip.show();
    }
  }
}
