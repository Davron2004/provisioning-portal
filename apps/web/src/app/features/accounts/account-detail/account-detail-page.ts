import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TERMINAL_ORDER_STATUSES } from '@provisioning/contracts';
import { EMPTY, filter, switchMap } from 'rxjs';
import { toApiProblem } from '../../../core/api/api-problem';
import { RealtimeService } from '../../../core/realtime/realtime';
import { DocumentTitle } from '../../../core/routing/title-strategy';
import { countOf } from '../../../shared/format/labels';
import { formatAbsoluteDate } from '../../../shared/time/format-time';
import { Breadcrumb, Breadcrumbs } from '../../../shared/ui/breadcrumbs/breadcrumbs';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { PlanBadge } from '../../../shared/ui/plan-badge/plan-badge';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { StatusChip } from '../../../shared/ui/status-chip/status-chip';
import { UtilizationMeter } from '../../../shared/ui/utilization-meter/utilization-meter';
import { AccountStore } from './account-store';

/** The account page: who the customer is, then its users, sites, numbers and orders as tabs. */
@Component({
  selector: 'app-account-detail-page',
  imports: [
    Breadcrumbs,
    EmptyState,
    ErrorState,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
    PlanBadge,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Skeleton,
    StatusChip,
    UtilizationMeter,
  ],
  providers: [AccountStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-detail-page.html',
  styleUrl: './account-detail-page.scss',
})
export class AccountDetailPage {
  protected readonly store = inject(AccountStore);
  protected readonly account = this.store.account;

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Accounts', link: '/accounts' },
    { label: this.account()?.name ?? 'Account' },
  ]);

  protected readonly tabs = computed(() => {
    const account = this.account();
    return [
      { path: 'users', label: 'Users', counted: true, count: account?.userCount },
      { path: 'sites', label: 'Sites', counted: true, count: account?.siteCount },
      { path: 'numbers', label: 'Numbers', counted: true, count: account?.numbersTotal },
      { path: 'orders', label: 'Orders', counted: false, count: undefined },
    ];
  });

  protected readonly notFound = computed(() => {
    const error = this.store.accountResource.error();
    return !!error && toApiProblem(error).status === 404;
  });

  protected readonly customerSince = computed(() => {
    const account = this.account();
    return account ? formatAbsoluteDate(account.createdAt) : '';
  });
  protected readonly countOf = countOf;

  constructor() {
    const documentTitle = inject(DocumentTitle);
    effect(() => documentTitle.setSubject(this.account()?.name ?? null));
    inject(DestroyRef).onDestroy(() => documentTitle.setSubject(null));

    // When an order for this account finishes, its counts (users, numbers) have moved.
    const realtime = inject(RealtimeService);
    toObservable(this.store.accountId)
      .pipe(
        switchMap((accountId) => (accountId ? realtime.orderUpdates(accountId) : EMPTY)),
        filter((order) => TERMINAL_ORDER_STATUSES.includes(order.status)),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.store.refreshCounts());
  }
}
