import { Injectable, inject } from '@angular/core';
import { ApiPaths, SitePage } from '@provisioning/contracts';
import { ApiClient } from './api-client';

@Injectable({ providedIn: 'root' })
export class SitesApi {
  private readonly api = inject(ApiClient);

  /** Every site of an account. */
  list(accountId: () => string | undefined) {
    return this.api.resource(SitePage, () => {
      const id = accountId();
      return id ? { path: ApiPaths.sites(id) } : undefined;
    });
  }
}
