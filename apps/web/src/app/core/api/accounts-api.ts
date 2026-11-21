import { Injectable, inject } from '@angular/core';
import { Account, AccountPage, ApiPaths } from '@provisioning/contracts';
import { ApiClient } from './api-client';

export interface AccountListQuery {
  readonly cursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly api = inject(ApiClient);

  list(query: () => AccountListQuery | undefined = () => ({})) {
    return this.api.resource(AccountPage, () => {
      const q = query();
      return q && { path: ApiPaths.accounts(), params: { cursor: q.cursor } };
    });
  }

  get(accountId: () => string | undefined) {
    return this.api.resource(Account, () => {
      const id = accountId();
      return id ? { path: ApiPaths.account(id) } : undefined;
    });
  }
}
