import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { NumberStatus, PhoneNumber } from '@provisioning/contracts';
import { NumbersApi } from '../../../../core/api/numbers-api';
import { pagedList } from '../../../../core/api/paged-list';
import { injectQueryParamsUpdater, oneOf } from '../../../../core/routing/query-params';
import { resultCountLabel } from '../../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../../shared/layout/media-query';
import { PhoneNumberPipe } from '../../../../shared/pipes/phone-number.pipe';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../../shared/ui/load-more/load-more';
import { RelativeTime } from '../../../../shared/ui/relative-time/relative-time';
import { statusStyle } from '../../../../shared/ui/status-chip/status';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { TableSkeleton } from '../../../../shared/ui/table-skeleton/table-skeleton';
import { AccountStore } from '../account-store';

const STATUSES = NumberStatus.options;

@Component({
  selector: 'app-numbers-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    PhoneNumberPipe,
    RelativeTime,
    RouterLink,
    StatusChip,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './numbers-tab.html',
  styleUrl: './numbers-tab.scss',
})
export class NumbersTab {
  /** Query parameters: `?site=<siteId>&status=<available|reserved|assigned>`. */
  readonly site = input<string>();
  readonly status = input<string>();

  protected readonly store = inject(AccountStore);
  private readonly numbersApi = inject(NumbersApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly siteId = computed(() => this.site() || null);
  protected readonly statusFilter = computed(() => oneOf(STATUSES, this.status()));
  protected readonly statusOptions = STATUSES.map((value) => ({
    value,
    label: statusStyle(value).label,
  }));

  protected readonly numbers = pagedList(
    () => {
      const accountId = this.store.accountId();
      return accountId
        ? { accountId, siteId: this.siteId(), status: this.statusFilter() }
        : undefined;
    },
    (request) => this.numbersApi.list(request),
  );

  protected readonly filtered = computed(() => !!this.siteId() || !!this.statusFilter());
  protected readonly columns = computed(() =>
    ['number', this.siteId() ? null : 'site', 'status', 'order', 'updated'].filter(
      (column): column is string => column !== null,
    ),
  );
  /** The size of the filtered inventory, where the account and site counters tell it. */
  private readonly total = computed(() => {
    const account = this.store.account();
    const siteId = this.siteId();
    const status = this.statusFilter();
    if (!account) {
      return undefined;
    }
    if (!siteId) {
      if (!status) {
        return account.numbersTotal;
      }
      return status === 'available' ? account.numbersTotal - account.numbersAssigned : undefined;
    }
    return status === 'available'
      ? this.store.sites()?.find((site) => site.id === siteId)?.numbersAvailable
      : undefined;
  });
  protected readonly loadedCount = computed(() => {
    const loaded = this.numbers.items().length;
    return resultCountLabel(loaded, loaded, this.numbers.hasMore(), 'number', this.total());
  });
  protected readonly trackByNumber = (_: number, number: PhoneNumber) => number.e164;

  protected setSite(siteId: string | null): void {
    void this.updateQuery({ site: siteId });
  }

  protected setStatus(status: string | null): void {
    void this.updateQuery({ status });
  }

  protected clearFilters(): void {
    void this.updateQuery({ site: null, status: null });
  }
}
