import { Injectable, inject } from '@angular/core';
import { ApiPaths, NumberStatus, PhoneNumberPage } from '@provisioning/contracts';
import { ApiClient } from './api-client';

export interface NumberListQuery {
  readonly accountId: string;
  readonly siteId?: string | null;
  readonly status?: NumberStatus | null;
  readonly cursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class NumbersApi {
  private readonly api = inject(ApiClient);

  /** DID inventory of an account. */
  list(query: () => NumberListQuery | undefined) {
    return this.api.resource(PhoneNumberPage, () => {
      const q = query();
      return (
        q && {
          path: ApiPaths.numbers(q.accountId),
          params: { siteId: q.siteId, status: q.status, cursor: q.cursor },
        }
      );
    });
  }
}
