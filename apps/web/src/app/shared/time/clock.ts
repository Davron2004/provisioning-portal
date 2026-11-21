import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The current time as a signal, ticking every 30 seconds; drives relative times. */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly current = signal(Date.now());
  readonly now = this.current.asReadonly();

  constructor() {
    const timer = setInterval(() => this.current.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
