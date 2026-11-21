import { BreakpointObserver } from '@angular/cdk/layout';
import { Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Below this width the navigation becomes a drawer over the content. */
export const COMPACT_LAYOUT = '(max-width: 959.98px)';
/** Phones: tables turn into stacked cards. */
export const HANDSET_LAYOUT = '(max-width: 599.98px)';

/** Whether a media query matches, as a signal. Must run in an injection context. */
export function injectMediaQuery(query: string): Signal<boolean> {
  const observer = inject(BreakpointObserver);
  return toSignal(observer.observe(query).pipe(map((state) => state.matches)), {
    initialValue: observer.isMatched(query),
  });
}
