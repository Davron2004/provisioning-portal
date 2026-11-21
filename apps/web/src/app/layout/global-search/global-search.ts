import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

/** Toolbar search box: Enter opens /search?q=. Press "/" anywhere to focus it. */
@Component({
  selector: 'app-global-search',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'focusOnSlash($event)' },
  template: `
    <form role="search" class="field" (submit)="submit($event)">
      <mat-icon class="leading" svgIcon="search" aria-hidden="true" />
      <input
        #input
        type="search"
        name="q"
        aria-label="Search users, numbers and orders"
        placeholder="Search users, numbers, orders"
        autocomplete="off"
        enterkeyhint="search"
        [value]="query()"
        (input)="query.set(input.value)"
        (keydown.escape)="input.blur()"
      />
      <kbd class="hint" aria-hidden="true">/</kbd>
    </form>
  `,
  styleUrl: './global-search.scss',
})
export class GlobalSearch {
  private readonly router = inject(Router);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  protected readonly query = signal('');

  protected submit(event: Event): void {
    event.preventDefault();
    const q = this.query().trim();
    void this.router.navigate(['/search'], { queryParams: q ? { q } : {} });
  }

  protected focusOnSlash(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return;
    }
    event.preventDefault();
    this.input().nativeElement.focus();
  }
}
