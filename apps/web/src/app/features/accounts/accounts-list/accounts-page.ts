import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AccountPlan, AccountStatus } from '@provisioning/contracts';
import { AccountsApi } from '../../../core/api/accounts-api';
import { pagedList } from '../../../core/api/paged-list';
import {
  injectQueryParamsUpdater,
  injectSearchParam,
  oneOf,
} from '../../../core/routing/query-params';
import { countOf, planLabel, resultCountLabel } from '../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../shared/layout/media-query';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../shared/ui/load-more/load-more';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { PlanBadge } from '../../../shared/ui/plan-badge/plan-badge';
import { statusStyle } from '../../../shared/ui/status-chip/status';
import { StatusChip } from '../../../shared/ui/status-chip/status-chip';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { UtilizationMeter } from '../../../shared/ui/utilization-meter/utilization-meter';
import {
  ACCOUNT_SORT_KEYS,
  AccountSortKey,
  SortDirection,
  filterAccounts,
  sortAccounts,
} from '../account-list';
import { Truncate } from '../../../shared/ui/truncate/truncate';

const STATUSES = AccountStatus.options;
const PLANS = AccountPlan.options;
const DEFAULT_SORT: AccountSortKey = 'name';

@Component({
  selector: 'app-accounts-page',
  imports: [
    Truncate,
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    PageHeader,
    PlanBadge,
    RouterLink,
    StatusChip,
    TableSkeleton,
    UtilizationMeter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  // Filters and sort live in the URL (query parameters bound as inputs).
  readonly q = input<string>();
  readonly status = input<string>();
  readonly plan = input<string>();
  readonly sort = input<string>();
  readonly dir = input<string>();

  private readonly accountsApi = inject(AccountsApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly search = injectSearchParam(this.q);
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly accounts = pagedList(
    () => ({}),
    (request) => this.accountsApi.list(request),
  );

  protected readonly statusOptions = STATUSES.map((value) => ({
    value,
    label: statusStyle(value).label,
  }));
  protected readonly planOptions = PLANS.map((value) => ({ value, label: planLabel(value) }));
  protected readonly columns = ['name', 'plan', 'status', 'sites', 'users', 'numbers'];

  protected readonly filter = computed(() => ({
    text: this.search.text(),
    status: oneOf(STATUSES, this.status()),
    plan: oneOf(PLANS, this.plan()),
  }));
  protected readonly filtered = computed(() => {
    const f = this.filter();
    return f.text || f.status || f.plan;
  });
  protected readonly sortKey = computed(
    () => oneOf(ACCOUNT_SORT_KEYS, this.sort()) ?? DEFAULT_SORT,
  );
  protected readonly sortDirection = computed<SortDirection>(() =>
    this.dir() === 'desc' ? 'desc' : 'asc',
  );

  protected readonly rows = computed(() =>
    sortAccounts(
      filterAccounts(this.accounts.items(), this.filter()),
      this.sortKey(),
      this.sortDirection(),
    ),
  );

  protected readonly resultCount = computed(() =>
    resultCountLabel(
      this.rows().length,
      this.accounts.items().length,
      this.accounts.hasMore(),
      'account',
    ),
  );
  protected readonly countOf = countOf;
  protected readonly trackById = (_: number, account: { id: string }) => account.id;

  protected setStatus(value: string | null): void {
    void this.updateQuery({ status: value });
  }

  protected setPlan(value: string | null): void {
    void this.updateQuery({ plan: value });
  }

  protected setSort(sort: Sort): void {
    const isDefault = sort.active === DEFAULT_SORT && sort.direction === 'asc';
    void this.updateQuery({
      sort: isDefault ? null : sort.active,
      dir: isDefault || sort.direction === 'asc' ? null : sort.direction,
    });
  }

  protected clearFilters(): void {
    this.search.set('');
    void this.updateQuery({ status: null, plan: null });
  }
}
