import { Injectable, inject } from '@angular/core';
import { ApiPaths, SearchEntity, SearchResponse } from '@provisioning/contracts';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

export interface SearchQuery {
  readonly q: string;
  readonly entity?: SearchEntity | null;
  readonly accountId?: string | null;
  readonly limit?: number | null;
}

@Injectable({ providedIn: 'root' })
export class SearchApi {
  private readonly api = inject(ApiClient);

  /** Full-text search over users, numbers and orders. Idle while the query is blank. */
  search(query: () => SearchQuery | undefined) {
    return this.api.resource(SearchResponse, () => {
      const q = query();
      if (!q || q.q.trim() === '') {
        return undefined;
      }
      return {
        path: ApiPaths.search(),
        params: { q: q.q.trim(), entity: q.entity, accountId: q.accountId, limit: q.limit },
      };
    });
  }

  /**
   * The same search as a cold Observable, for pipelines that debounce typing and
   * cancel the request in flight when a newer query starts (`switchMap`).
   */
  find(query: SearchQuery): Observable<SearchResponse> {
    return this.api.get(SearchResponse, {
      path: ApiPaths.search(),
      params: {
        q: query.q.trim(),
        entity: query.entity,
        accountId: query.accountId,
        limit: query.limit,
      },
    });
  }
}
