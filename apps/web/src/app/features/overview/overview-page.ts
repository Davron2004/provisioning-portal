import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-overview-page',
  imports: [EmptyState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      title="Overview"
      subtitle="Accounts, numbers and orders across every customer."
    />
    <app-empty-state
      icon="dashboard"
      heading="Nothing to summarize yet"
      message="Counts for accounts, sites, users and numbers, and the latest orders, will appear here."
    />
  `,
})
export class OverviewPage {}
