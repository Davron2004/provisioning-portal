import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-search-page',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Search" [subtitle]="subtitle()" />
    <app-empty-state
      icon="search"
      heading="Search is on the way"
      message="Find users by name or extension, numbers by digits, and orders by title, across every account."
    />
  `,
})
export class SearchPage {
  /** `?q=` query parameter. */
  readonly q = input<string>();

  protected readonly subtitle = computed(() => {
    const q = this.q()?.trim();
    return q ? `Results for “${q}”` : 'Users, numbers and orders across every account.';
  });
}
