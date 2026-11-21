import type { Repositories } from '../data/repositories';

/** Everything the REST routes depend on. Built once per Lambda container in handlers/http.ts. */
export interface ApiDeps extends Repositories {
  now: () => Date;
}
