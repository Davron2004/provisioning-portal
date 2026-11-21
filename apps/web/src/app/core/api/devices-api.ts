import { Injectable, inject } from '@angular/core';
import { ApiPaths, DeviceCatalog } from '@provisioning/contracts';
import { ApiClient } from './api-client';

@Injectable({ providedIn: 'root' })
export class DevicesApi {
  private readonly api = inject(ApiClient);

  /** Device models that can be assigned to users. */
  catalog() {
    return this.api.resource(DeviceCatalog, () => ({ path: ApiPaths.devices() }));
  }
}
