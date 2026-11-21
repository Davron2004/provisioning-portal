import { Injectable, Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Account, Site } from '@provisioning/contracts';
import { map } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts-api';
import { SitesApi } from '../../../core/api/sites-api';

/**
 * State shared by the account page and its tabs: the account and its sites, loaded
 * once per account. Provided by AccountDetailPage, so every tab under its router
 * outlet injects the same instance, and it goes away with the page.
 */
@Injectable()
export class AccountStore {
  private readonly accountsApi = inject(AccountsApi);
  private readonly sitesApi = inject(SitesApi);

  /** The `:accountId` route parameter of the page that provides this store. */
  readonly accountId: Signal<string | undefined> = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('accountId') ?? undefined)),
    { requireSync: true },
  );

  readonly accountResource = this.accountsApi.get(this.accountId);
  readonly sitesResource = this.sitesApi.list(this.accountId);

  readonly account: Signal<Account | undefined> = computed(() =>
    this.accountResource.hasValue() ? this.accountResource.value() : undefined,
  );
  readonly sites: Signal<readonly Site[] | undefined> = computed(() =>
    this.sitesResource.hasValue() ? this.sitesResource.value()?.items : undefined,
  );
  /** Site id -> site name, for tables that show where a user or number is. */
  readonly siteNames = computed(
    () => new Map((this.sites() ?? []).map((site) => [site.id, site.name] as const)),
  );

  /** Counters on the account and its sites change when an order finishes. */
  refreshCounts(): void {
    this.accountResource.reload();
    this.sitesResource.reload();
  }
}
