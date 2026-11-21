import { Injectable, inject } from '@angular/core';
import { ApiPaths, VoiceUserPage } from '@provisioning/contracts';
import { ApiClient } from './api-client';

export interface UserListQuery {
  readonly accountId: string;
  readonly siteId?: string | null;
  readonly cursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly api = inject(ApiClient);

  list(query: () => UserListQuery | undefined) {
    return this.api.resource(VoiceUserPage, () => {
      const q = query();
      return (
        q && { path: ApiPaths.users(q.accountId), params: { siteId: q.siteId, cursor: q.cursor } }
      );
    });
  }
}
