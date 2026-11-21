import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-accounts-page',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header title="Accounts" subtitle="Customer accounts on the phone service." />
    <app-empty-state
      icon="domain"
      heading="No accounts to show yet"
      message="Customer accounts, with their sites, users and number inventory, will be listed here."
    />
  `,
})
export class AccountsPage {}
