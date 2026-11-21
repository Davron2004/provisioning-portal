import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { OrderStatus } from '@provisioning/contracts';
import { anOrder } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { OrdersApi } from './orders-api';

describe('OrdersApi', () => {
  let http: HttpTestingController;
  let api: OrdersApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestConfig()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(OrdersApi);
  });

  afterEach(() => http.verify());

  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  it('reads an order as a resource validated against the contract', async () => {
    const ref = signal<{ accountId: string; orderId: string } | undefined>(undefined);
    const order = TestBed.runInInjectionContext(() => api.get(ref));
    TestBed.tick();
    http.expectNone(() => true);

    ref.set({ accountId: 'acc_northwind', orderId: 'ord_0001' });
    TestBed.tick();
    http.expectOne('http://api.test/accounts/acc_northwind/orders/ord_0001').flush(anOrder());
    await settle();

    expect(order.value()?.title).toBe('Add 2 users at Kanata Campus');
  });

  it('surfaces a contract mismatch as an error instead of bad data', async () => {
    const order = TestBed.runInInjectionContext(() =>
      api.get(() => ({ accountId: 'acc_northwind', orderId: 'ord_0001' })),
    );
    TestBed.tick();
    http.expectOne(() => true).flush({ id: 'ord_0001' });
    await settle();

    expect(order.error()).toBeTruthy();
    expect(order.hasValue()).toBe(false);
  });

  it('sends only the filters that are set', async () => {
    const status = signal<OrderStatus | null>(null);
    TestBed.runInInjectionContext(() => api.listAll(() => ({ status: status(), cursor: null })));
    TestBed.tick();
    const first = http.expectOne((req) => req.url === 'http://api.test/orders');
    expect(first.request.params.keys()).toEqual([]);
    first.flush({ items: [], nextCursor: null });
    await settle();

    status.set('failed');
    TestBed.tick();
    const second = http.expectOne((req) => req.url === 'http://api.test/orders');
    expect(second.request.params.get('status')).toBe('failed');
    second.flush({ items: [], nextCursor: null });
  });

  it('retries an order with a POST and parses the result', () => {
    let result: unknown;
    api.retry('acc_northwind', 'ord_0001').subscribe((order) => (result = order));

    const req = http.expectOne('http://api.test/accounts/acc_northwind/orders/ord_0001/retry');
    expect(req.request.method).toBe('POST');
    req.flush(anOrder({ status: 'provisioning' }));

    expect(result).toMatchObject({ id: 'ord_0001', status: 'provisioning' });
  });
});
