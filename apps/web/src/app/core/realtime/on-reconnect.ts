import { effect, inject, untracked } from '@angular/core';
import { RealtimeService } from './realtime';

/**
 * Runs `callback` each time the realtime connection comes back after a drop.
 * Pushes are best effort and anything sent while disconnected is lost, so a page
 * that shows live data re-fetches it here. Must run in an injection context.
 *
 *   onRealtimeReconnect(() => this.order.reload());
 */
export function onRealtimeReconnect(callback: () => void): void {
  const realtime = inject(RealtimeService);
  let dropped = false;
  effect(() => {
    const state = realtime.state();
    if (state === 'reconnecting') {
      dropped = true;
    } else if (state === 'live' && dropped) {
      dropped = false;
      untracked(callback);
    }
  });
}
