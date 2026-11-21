import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { VoiceUser } from '@provisioning/contracts';
import { DevicesApi } from '../../../../core/api/devices-api';
import { pagedList } from '../../../../core/api/paged-list';
import { UsersApi } from '../../../../core/api/users-api';
import { injectQueryParamsUpdater, injectSearchParam } from '../../../../core/routing/query-params';
import { deviceName, fullName, resultCountLabel } from '../../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../../shared/layout/media-query';
import { PhoneNumberPipe } from '../../../../shared/pipes/phone-number.pipe';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state/error-state';
import { LoadMore } from '../../../../shared/ui/load-more/load-more';
import { StatusChip } from '../../../../shared/ui/status-chip/status-chip';
import { TableSkeleton } from '../../../../shared/ui/table-skeleton/table-skeleton';
import { AccountStore } from '../account-store';

@Component({
  selector: 'app-users-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadMore,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    PhoneNumberPipe,
    StatusChip,
    TableSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-tab.html',
  styleUrl: './users-tab.scss',
})
export class UsersTab {
  /** Query parameters: `?site=<siteId>&q=<text>`. */
  readonly site = input<string>();
  readonly q = input<string>();

  protected readonly store = inject(AccountStore);
  private readonly usersApi = inject(UsersApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly search = injectSearchParam(this.q);
  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);

  protected readonly siteId = computed(() => this.site() || null);
  protected readonly users = pagedList(
    () => {
      const accountId = this.store.accountId();
      // The URL's `q` follows the box once typing pauses (SEARCH_DEBOUNCE_MS), so the
      // API is asked once per pause, not per keystroke.
      return accountId
        ? { accountId, siteId: this.siteId(), q: this.q()?.trim() || null }
        : undefined;
    },
    (request) => this.usersApi.list(request),
  );
  private readonly catalog = inject(DevicesApi).catalog();

  /** Device model id -> catalog name. */
  protected readonly deviceName = computed(() => {
    const devices = this.catalog.hasValue() ? this.catalog.value()?.items : undefined;
    return (user: VoiceUser) => deviceName(devices, user.device?.model);
  });

  protected readonly rows = this.users.items;
  protected readonly filtered = computed(() => !!this.siteId() || !!this.search.text().trim());
  /** The text filter the loaded rows were fetched with (follows the URL, not the box). */
  protected readonly searching = computed(() => !!this.q()?.trim());
  protected readonly columns = computed(() =>
    [
      'name',
      this.siteId() ? null : 'site',
      'extension',
      'did',
      'voicemail',
      'device',
      'status',
    ].filter((column): column is string => column !== null),
  );
  /** How many users the account (or the chosen site) has, from the maintained counters. */
  private readonly total = computed(() => {
    const siteId = this.siteId();
    return siteId
      ? this.store.sites()?.find((site) => site.id === siteId)?.userCount
      : this.store.account()?.userCount;
  });
  protected readonly resultCount = computed(() => {
    const loaded = this.users.items().length;
    if (this.searching()) {
      const n = loaded.toLocaleString('en');
      const noun = loaded === 1 ? 'match' : 'matches';
      return this.users.hasMore() ? `First ${n} ${noun}` : `${n} ${noun}`;
    }
    return resultCountLabel(loaded, loaded, this.users.hasMore(), 'user', this.total());
  });

  protected readonly fullName = fullName;
  protected readonly trackById = (_: number, user: VoiceUser) => user.id;

  protected setSite(siteId: string | null): void {
    void this.updateQuery({ site: siteId });
  }

  protected clearFilters(): void {
    this.search.reset();
    void this.updateQuery({ site: null, q: null });
  }
}
