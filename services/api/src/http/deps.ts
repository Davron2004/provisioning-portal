import type { Repositories } from '../data/repositories';
import type { OrderService } from '../orders/order-service';

/** Everything the REST routes depend on. Built once per Lambda container in handlers/http.ts. */
export interface ApiDeps extends Repositories {
  orderService: OrderService;
  now: () => Date;
}
