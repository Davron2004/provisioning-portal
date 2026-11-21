import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Breadcrumb, Breadcrumbs } from '../../shared/ui/breadcrumbs/breadcrumbs';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-new-order-page',
  imports: [Breadcrumbs, EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="New order" subtitle="Add, change or remove users at this account.">
      <app-breadcrumbs breadcrumbs [items]="breadcrumbs()" />
    </app-page-header>
    <app-empty-state
      icon="receipt_long"
      heading="The order form is on the way"
      message="Build an order line by line or describe it in plain English, preview every change, then submit it for provisioning."
    />
  `,
})
export class NewOrderPage {
  /** Route parameter (bound with withComponentInputBinding). */
  readonly accountId = input.required<string>();

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Accounts', link: '/accounts' },
    { label: this.accountId(), link: ['/accounts', this.accountId()] },
    { label: 'New order' },
  ]);
}
