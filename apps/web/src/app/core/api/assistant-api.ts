import { Injectable, inject } from '@angular/core';
import { ApiPaths, InterpretRequest, InterpretResponse } from '@provisioning/contracts';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';

@Injectable({ providedIn: 'root' })
export class AssistantApi {
  private readonly api = inject(ApiClient);

  /**
   * Turns a plain-English request into an intent, a draft and a preview. Nothing is
   * provisioned: the person reviews the preview and submits it through OrdersApi.
   */
  interpret(accountId: string, request: InterpretRequest): Observable<InterpretResponse> {
    return this.api.post(InterpretResponse, ApiPaths.interpret(accountId), request);
  }
}
