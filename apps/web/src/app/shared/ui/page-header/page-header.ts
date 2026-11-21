import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

/**
 * The top of every page: optional breadcrumbs, the page's single <h1>, a subtitle,
 * and actions aligned to the right (they wrap below the title on narrow screens).
 *
 *   <app-page-header title="Kanata Campus" subtitle="12 users · 40 numbers">
 *     <app-breadcrumbs breadcrumbs [items]="crumbs()" />
 *     <button matButton="filled" actions>New order</button>
 *   </app-page-header>
 *
 * The heading takes focus after navigation (see Shell), so it has tabindex="-1".
 * While the title is still loading (`[loading]="true"`), the <h1> stays in place,
 * at its final height, with a placeholder bar: nothing shifts when the name arrives.
 */
@Component({
  selector: 'app-page-header',
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content select="[breadcrumbs]" />
    <div class="row">
      <div class="titles">
        <h1 class="title" tabindex="-1" [attr.aria-busy]="loading() || null">
          @if (loading()) {
            <span class="app-visually-hidden">Loading</span>
            <app-skeleton class="title-skeleton" width="min(320px, 60vw)" height="28px" />
          } @else {
            <span>{{ title() }}</span>
          }
        </h1>
        @if (subtitle()) {
          <p class="subtitle">{{ subtitle() }}</p>
        }
        <ng-content />
      </div>
      <div class="actions">
        <ng-content select="[actions]" />
      </div>
    </div>
  `,
  styleUrl: './page-header.scss',
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly loading = input(false);
}
