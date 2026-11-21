import { DestroyRef, Signal, inject, linkedSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

export type QueryParamValue = string | null | undefined;

/**
 * Returns a function that merges filter values into the current URL's query
 * parameters. Empty values are removed, and the history entry is replaced so the
 * back button leaves the page instead of undoing each keystroke.
 *
 * Pages read the same parameters back as inputs (withComponentInputBinding), so the
 * URL is the single source of truth for filters, sort and tabs.
 */
export function injectQueryParamsUpdater(): (
  params: Readonly<Record<string, QueryParamValue>>,
) => Promise<boolean> {
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  return (params) => {
    const queryParams: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(params)) {
      queryParams[key] = value === undefined || value === '' ? null : value;
    }
    return router.navigate([], {
      relativeTo: route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  };
}

/** Narrows a raw query parameter to one of the allowed values, or null. */
export function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** How long typing must pause before a search box writes to the URL. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface SearchParam {
  /** What is in the box right now; filter on this so results follow every keystroke. */
  readonly text: Signal<string>;
  set(value: string): void;
}

/**
 * A search box backed by a query parameter. The box filters immediately, and the
 * URL follows once typing pauses, so the box never fights the router mid-word.
 * Navigating back/forward (or clearing the parameter elsewhere) updates the box.
 */
export function injectSearchParam(param: () => string | undefined, key = 'q'): SearchParam {
  const updateQuery = injectQueryParamsUpdater();
  const text = linkedSignal(() => param() ?? '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return {
    text,
    set(value) {
      text.set(value);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void updateQuery({ [key]: value.trim() ? value : null });
      }, SEARCH_DEBOUNCE_MS);
    },
  };
}
