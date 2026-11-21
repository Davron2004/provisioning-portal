import { Injectable, inject } from '@angular/core';
import { ApiPaths, Overview } from '@provisioning/contracts';
import { ApiClient } from './api-client';

@Injectable({ providedIn: 'root' })
export class OverviewApi {
  private readonly api = inject(ApiClient);

  /** Fleet-wide counts and the most recent orders. */
  overview() {
    return this.api.resource(Overview, () => ({ path: ApiPaths.overview() }));
  }
}
