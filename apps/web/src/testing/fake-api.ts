import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { EnvironmentProviders, Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { VoiceUser } from '@provisioning/contracts';
import { LOCAL_CONFIG } from './test-config';

/** A response body, or a function of the request that returns one (or throws an HttpErrorResponse). */
export type FakeHandler = unknown | ((request: HttpRequest<unknown>) => unknown);

/**
 * An in-memory API for page tests: answers GETs by path, the way the real API would,
 * and records every request so tests can assert on query parameters.
 *
 *   const api = new FakeApi().on('/accounts', aPage([anAccount()]));
 *   providers: [provideFakeApi(api)]
 *
 * Pages read through httpResource, which holds the app "unstable" while a request is
 * open, so answering at once keeps `await fixture.whenStable()` simple. Use `hold()`
 * for the rare test that needs to look at a loading state.
 */
export class FakeApi {
  readonly requests: HttpRequest<unknown>[] = [];
  private readonly handlers = new Map<string, FakeHandler>();
  private readonly held = new Set<string>();

  on(path: string, respond: (request: HttpRequest<unknown>) => unknown): this;
  on(path: string, body: unknown): this;
  on(path: string, handler: FakeHandler): this {
    this.handlers.set(path, handler);
    this.held.delete(path);
    return this;
  }

  /**
   * Serves a users list like GET /accounts/{id}/users: honors `siteId`, `q` (case-insensitive
   * name, email, extension, or DID digits), `limit` and an opaque `cursor`.
   */
  onUsers(path: string, users: readonly VoiceUser[], defaultLimit = 25): this {
    return this.on(path, (request) => {
      const siteId = request.params.get('siteId');
      const q = (request.params.get('q') ?? '').trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      const limit = Number(request.params.get('limit') ?? defaultLimit);
      const start = Number(request.params.get('cursor') ?? 0);
      const matching = users.filter(
        (user) =>
          (!siteId || user.siteId === siteId) &&
          (!q ||
            [`${user.firstName} ${user.lastName}`, user.email, user.extension].some((field) =>
              field.toLowerCase().includes(q),
            ) ||
            (digits !== '' && (user.did ?? '').replace(/\D/g, '').includes(digits))),
      );
      const end = start + limit;
      return {
        items: matching.slice(start, end),
        nextCursor: end < matching.length ? String(end) : null,
      };
    });
  }

  /** Fails every request to `path` with this status and an ApiError body. */
  fail(path: string, status: number, message = 'Something broke.'): this {
    return this.on(path, () => {
      throw new HttpErrorResponse({
        status,
        url: `${LOCAL_CONFIG.apiBaseUrl}${path}`,
        error: { error: { code: status === 404 ? 'not_found' : 'internal', message } },
      });
    });
  }

  /** Requests to `path` stay open (loading) until `on()` gives it a response. */
  hold(path: string): this {
    this.held.add(path);
    return this;
  }

  /** Requests made to `path`, oldest first. */
  requestsTo(path: string): HttpRequest<unknown>[] {
    return this.requests.filter((request) => pathOf(request) === path);
  }

  handle(request: HttpRequest<unknown>): Observable<HttpResponse<unknown>> {
    this.requests.push(request);
    const path = pathOf(request);
    if (this.held.has(path)) {
      return new Observable();
    }
    if (!this.handlers.has(path)) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            url: request.urlWithParams,
            error: { error: { code: 'not_found', message: `No fake response for ${path}` } },
          }),
      );
    }
    const handler = this.handlers.get(path);
    try {
      const body =
        typeof handler === 'function'
          ? (handler as (r: HttpRequest<unknown>) => unknown)(request)
          : handler;
      return of(new HttpResponse({ status: 200, body: structuredClone(body) }));
    } catch (error) {
      return throwError(() => error);
    }
  }
}

function pathOf(request: HttpRequest<unknown>): string {
  return request.url.replace(LOCAL_CONFIG.apiBaseUrl, '');
}

export function provideFakeApi(api: FakeApi): (Provider | EnvironmentProviders)[] {
  const interceptor: HttpInterceptorFn = (request) => api.handle(request);
  return [{ provide: FakeApi, useValue: api }, provideHttpClient(withInterceptors([interceptor]))];
}
