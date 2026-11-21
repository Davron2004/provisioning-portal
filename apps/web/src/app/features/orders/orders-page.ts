import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-orders-page',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Orders"
      subtitle="Provisioning orders across all accounts, newest first."
    />
    <app-empty-state
      icon="receipt_long"
      heading="No orders to show yet"
      message="Orders move from submitted to active as each line is provisioned. You will be able to follow them live here."
    />
  `,
})
export class OrdersPage {}
