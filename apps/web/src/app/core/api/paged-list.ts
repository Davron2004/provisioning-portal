import { HttpResourceRef } from '@angular/common/http';
import { Signal, computed, linkedSignal } from '@angular/core';

/** The shape of every cursor-paginated list in the contract (`page()` in contracts/api.ts). */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/**
 * A "load more" list over a cursor-paginated endpoint. Pages accumulate until the
 * query changes, which starts over from the first page.
 */
export interface PagedList<T> {
  /** Every item loaded so far, in API order. */
  readonly items: Signal<readonly T[]>;
  /** Nothing loaded yet and the first page is on its way: show a skeleton. */
  readonly isFirstLoad: Signal<boolean>;
  readonly isLoadingMore: Signal<boolean>;
  readonly hasMore: Signal<boolean>;
  /** The first page failed: show an error state in place of the list. */
  readonly error: Signal<unknown>;
  /** A later page failed: keep the list, offer a retry under it. */
  readonly loadMoreError: Signal<unknown>;
  loadMore(): void;
  /** Retries the page that failed, or refreshes the last page loaded. */
  retry(): void;
}

type WithCursor<Q> = Q & { readonly cursor: string | null };

interface LoadedPage<T> {
  readonly cursor: string | null;
  readonly page: CursorPage<T>;
}

/**
 * Builds a PagedList from a query and a resource factory from one of the API services:
 *
 *   readonly users = pagedList(
 *     () => ({ accountId: this.accountId(), siteId: this.siteId() }),
 *     (request) => this.usersApi.list(request),
 *   );
 *
 * Return `undefined` from `query` to stay idle. Must run in an injection context.
 */
export function pagedList<Q extends object, T>(
  query: () => Q | undefined,
  load: (request: () => WithCursor<Q> | undefined) => HttpResourceRef<CursorPage<T> | undefined>,
): PagedList<T> {
  const params = computed(query, { equal: sameParams });
  const cursor = linkedSignal<Q | undefined, string | null>({
    source: params,
    computation: () => null,
  });
  const resource = load(() => {
    const p = params();
    return p && { ...p, cursor: cursor() };
  });

  // Pages loaded for the current query. A page that loads again (retry, refresh)
  // replaces itself and anything after it, so items are never duplicated.
  const loaded = linkedSignal({
    source: () => ({
      params: params(),
      cursor: cursor(),
      page: resource.hasValue() ? resource.value() : undefined,
    }),
    computation: (source, previous): { params: Q | undefined; pages: LoadedPage<T>[] } => {
      const sameQuery = previous !== undefined && previous.value.params === source.params;
      const pages = sameQuery ? previous.value.pages : [];
      if (!source.page) {
        return { params: source.params, pages };
      }
      const index = pages.findIndex((p) => p.cursor === source.cursor);
      const kept = index === -1 ? pages : pages.slice(0, index);
      return {
        params: source.params,
        pages: [...kept, { cursor: source.cursor, page: source.page }],
      };
    },
  });

  const nextCursor = computed(() => loaded().pages.at(-1)?.page.nextCursor ?? null);
  const onFirstPage = computed(() => cursor() === null);

  return {
    items: computed(() => loaded().pages.flatMap((p) => p.page.items)),
    isFirstLoad: computed(() => resource.isLoading() && loaded().pages.length === 0),
    isLoadingMore: computed(() => resource.isLoading() && !onFirstPage()),
    hasMore: computed(() => nextCursor() !== null),
    error: computed(() => (onFirstPage() ? resource.error() : undefined)),
    loadMoreError: computed(() => (onFirstPage() ? undefined : resource.error())),
    loadMore: () => {
      const next = nextCursor();
      if (next !== null && !resource.isLoading()) {
        cursor.set(next);
      }
    },
    retry: () => resource.reload(),
  };
}

/** Query objects are rebuilt on every read; compare them by their values. */
function sameParams<Q extends object>(a: Q | undefined, b: Q | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = Object.keys(a) as (keyof Q)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
