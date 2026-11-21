import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Breadcrumb, Breadcrumbs } from '../../shared/ui/breadcrumbs/breadcrumbs';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-order-detail-page',
  imports: [Breadcrumbs, EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="'Order ' + orderId()" subtitle="Line-by-line provisioning progress.">
      <app-breadcrumbs breadcrumbs [items]="breadcrumbs()" />
    </app-page-header>
    <app-empty-state
      icon="receipt_long"
      heading="Order progress is on the way"
      message="Each line of this order, its current step and any failures will appear here as they happen."
    />
  `,
})
export class OrderDetailPage {
  readonly accountId = input.required<string>();
  readonly orderId = input.required<string>();

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Accounts', link: '/accounts' },
    { label: this.accountId(), link: ['/accounts', this.accountId()] },
    { label: this.orderId() },
  ]);
}
