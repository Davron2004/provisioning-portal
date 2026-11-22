import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toApiProblem } from '../../../core/api/api-problem';

/**
 * The foot of a paginated list: how many are shown, and a button for the next page.
 * A failed page keeps the list and offers a retry here.
 *
 *   <app-load-more noun="users" [shown]="list.items().length" [hasMore]="list.hasMore()"
 *     [loading]="list.isLoadingMore()" [error]="list.loadMoreError()"
 *     (loadMore)="list.loadMore()" (retry)="list.retry()" />
 */
@Component({
  selector: 'app-load-more',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="count app-numeric" aria-live="polite">
      @if (error()) {
        <span class="error" role="alert">{{ problem() }}</span>
      } @else {
        {{ summary() }}
      }
    </p>
    @if (error()) {
      <button matButton="outlined" type="button" (click)="retry.emit()">
        <mat-icon svgIcon="refresh" />
        Try again
      </button>
    } @else if (hasMore()) {
      <button
        matButton="outlined"
        type="button"
        [disabled]="loading()"
        [attr.aria-busy]="loading()"
        (click)="loadMore.emit()"
      >
        @if (loading()) {
          <mat-spinner diameter="18" aria-hidden="true" />
          Loading
        } @else {
          Load more
        }
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-space-3);
      min-block-size: 56px;
      /* The count lines up with the text in the rows above (cell or card padding plus
         the 1px border of the table card or the cards). */
      padding: var(--app-space-2) calc(var(--app-space-5) + 1px);
    }
    @media (max-width: 599.98px) {
      :host {
        padding-inline: calc(var(--app-space-4) + 1px);
      }
    }
    .count {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--app-status-error-fg);
    }
    mat-spinner {
      display: inline-block;
      margin-inline-end: var(--app-space-2);
      vertical-align: middle;
    }
  `,
})
export class LoadMore {
  /** Plural noun for the summary, e.g. "users". */
  readonly noun = input.required<string>();
  readonly shown = input.required<number>();
  readonly hasMore = input.required<boolean>();
  readonly loading = input(false);
  readonly error = input<unknown>();

  readonly loadMore = output();
  readonly retry = output();

  protected readonly summary = computed(() =>
    this.hasMore()
      ? `Showing the first ${this.shown()} ${this.noun()}`
      : `Showing all ${this.shown()} ${this.noun()}`,
  );
  protected readonly problem = computed(
    () => `Could not load more ${this.noun()}. ${toApiProblem(this.error()).message}`,
  );
}
