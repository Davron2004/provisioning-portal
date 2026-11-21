import { BreakpointObserver } from '@angular/cdk/layout';
import { Provider } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';

/** Answers the app's `(max-width: …px)` media queries for a window width a test sets. */
export class FakeViewport {
  readonly width: BehaviorSubject<number>;

  constructor(width = 1440) {
    this.width = new BehaviorSubject(width);
  }

  resize(width: number): void {
    this.width.next(width);
  }

  matches(query: string): boolean {
    const maxWidth = /max-width: ([\d.]+)px/.exec(query)?.[1];
    return maxWidth !== undefined && this.width.value <= Number(maxWidth);
  }
}

/** Replaces the BreakpointObserver behind `injectMediaQuery` with a window of `viewport`'s width. */
export function provideViewport(viewport: FakeViewport): Provider {
  const observer: Partial<BreakpointObserver> = {
    observe: (query) =>
      viewport.width.pipe(
        map(() => ({ matches: viewport.matches(query as string), breakpoints: {} })),
      ),
    isMatched: (query) => viewport.matches(query as string),
  };
  return { provide: BreakpointObserver, useValue: observer };
}
