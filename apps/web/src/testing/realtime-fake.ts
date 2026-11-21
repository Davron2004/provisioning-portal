import { Provider, signal } from '@angular/core';
import { ALL_ACCOUNTS, Order } from '@provisioning/contracts';
import { Observable, Subject, filter } from 'rxjs';
import { ConnectionState, RealtimeService } from '../app/core/realtime/realtime';

/** Stands in for the WebSocket: tests push orders with `push()`. */
export class FakeRealtime {
  readonly state = signal<ConnectionState>('live');
  private readonly updates = new Subject<Order>();
  /** Account ids currently subscribed to, one entry per subscriber. */
  readonly subscribed: string[] = [];

  orderUpdates(accountId: string = ALL_ACCOUNTS): Observable<Order> {
    return new Observable<Order>((subscriber) => {
      this.subscribed.push(accountId);
      const sub = this.updates
        .pipe(filter((order) => accountId === ALL_ACCOUNTS || order.accountId === accountId))
        .subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.subscribed.splice(this.subscribed.indexOf(accountId), 1);
      };
    });
  }

  push(order: Order): void {
    this.updates.next(order);
  }
}

export function provideFakeRealtime(fake = new FakeRealtime()): Provider[] {
  return [
    { provide: FakeRealtime, useValue: fake },
    { provide: RealtimeService, useValue: fake },
  ];
}
