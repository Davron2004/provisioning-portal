import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Breadcrumb, Breadcrumbs } from '../../shared/ui/breadcrumbs/breadcrumbs';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-account-detail-page',
  imports: [Breadcrumbs, EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="accountId()" subtitle="Sites, users and numbers of this account.">
      <app-breadcrumbs breadcrumbs [items]="breadcrumbs()" />
    </app-page-header>
    <app-empty-state
      icon="domain"
      heading="Account details are on the way"
      message="Sites, users, numbers and recent orders for this account will appear here."
    />
  `,
})
export class AccountDetailPage {
  /** Route parameter (bound with withComponentInputBinding). */
  readonly accountId = input.required<string>();

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Accounts', link: '/accounts' },
    { label: this.accountId() },
  ]);
}
