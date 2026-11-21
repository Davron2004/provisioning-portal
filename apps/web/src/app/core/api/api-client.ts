import { HttpClient, HttpParams, HttpResourceRef, httpResource } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import * as z from 'zod';
import { AppConfig } from '../config/app-config';

/** Largest page the list endpoints return. */
export const MAX_PAGE_SIZE = 100;

export type QueryParams = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** A GET against the API: a path from `ApiPaths` plus optional query parameters. */
export interface ApiRead {
  readonly path: string;
  readonly params?: QueryParams;
}

/**
 * Thin layer over HttpClient for our REST API. Every response is validated against
 * its contract schema, so a component only ever sees data that matches the types.
 *
 * Conventions used by the per-resource services (AccountsApi, OrdersApi, ...):
 * - Reads are `httpResource`s (`resource()`): reactive, cancel stale requests, and
 *   expose `value()`, `isLoading()`, `error()` and `reload()` as signals.
 * - Commands (POST) are cold Observables (`post()`): nothing happens until subscribed.
 * - Failures are HttpErrorResponse or ZodError; show them with `toApiProblem()`,
 *   `<app-error-state>`, or `NotificationService.error()`.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  url(path: string): string {
    return `${this.config.value.apiBaseUrl.replace(/\/+$/, '')}${path}`;
  }

  /**
   * A reactive GET. `request` is re-evaluated whenever the signals it reads change;
   * return `undefined` to stay idle (for example while a route parameter is missing).
   *
   * Like every httpResource it must be created in an injection context: a field
   * initializer or constructor of a component or service.
   */
  resource<S extends z.ZodType>(
    schema: S,
    request: () => ApiRead | undefined,
  ): HttpResourceRef<z.output<S> | undefined> {
    return httpResource(
      () => {
        const read = request();
        return read && { url: this.url(read.path), params: toHttpParams(read.params) };
      },
      { parse: (body: unknown) => schema.parse(body) },
    );
  }

  get<S extends z.ZodType>(schema: S, read: ApiRead): Observable<z.output<S>> {
    return this.http
      .get<unknown>(this.url(read.path), { params: toHttpParams(read.params) })
      .pipe(map((body) => schema.parse(body)));
  }

  /**
   * Every item of a cursor-paginated list, following `nextCursor` page by page.
   * Only for lists known to be short (one account's users or free numbers), where a
   * picker needs all of them at once; anything longer belongs in a "load more" list.
   */
  getAll<T>(
    schema: z.ZodType<{ items: T[]; nextCursor: string | null }>,
    read: ApiRead,
  ): Observable<T[]> {
    const pageAt = (cursor: string | null) =>
      this.get(schema, { ...read, params: { ...read.params, limit: MAX_PAGE_SIZE, cursor } });
    return pageAt(null).pipe(
      expand((page) => (page.nextCursor ? pageAt(page.nextCursor) : EMPTY)),
      reduce<{ items: T[] }, T[]>((all, page) => [...all, ...page.items], []),
    );
  }

  post<S extends z.ZodType>(schema: S, path: string, body: unknown): Observable<z.output<S>> {
    return this.http
      .post<unknown>(this.url(path), body)
      .pipe(map((response) => schema.parse(response)));
  }
}

/** Drops empty values, so optional filters never appear as `?status=`. */
export function toHttpParams(params: QueryParams | undefined): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}
