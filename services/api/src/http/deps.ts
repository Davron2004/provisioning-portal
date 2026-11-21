import type { AssistantService } from '../assistant/assistant-service';
import type { Repositories } from '../data/repositories';
import type { OrderService } from '../orders/order-service';
import type { SearchService } from '../search/search-service';

/** Everything the REST routes depend on. Built once per Lambda container in handlers/http.ts. */
export interface ApiDeps extends Repositories {
  orderService: OrderService;
  search: Pick<SearchService, 'search'>;
  assistant: Pick<AssistantService, 'interpret'>;
  now: () => Date;
}
