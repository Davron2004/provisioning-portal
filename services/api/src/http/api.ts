import { createHttpApp, type HttpApp } from './app';
import type { ApiDeps } from './deps';
import { Router } from './router';
import { registerAccountRoutes } from './routes/accounts';
import { registerOrderReadRoutes, registerOrderWriteRoutes } from './routes/orders';
import { registerOverviewRoutes } from './routes/overview';
import { registerSearchRoutes } from './routes/search';

/** Every REST route in packages/contracts/src/api.ts. */
export function buildRouter(deps: ApiDeps): Router {
  const router = new Router();
  registerOverviewRoutes(router, deps);
  registerAccountRoutes(router, deps);
  registerOrderReadRoutes(router, deps);
  registerOrderWriteRoutes(router, deps);
  registerSearchRoutes(router, deps);
  return router;
}

export function createApi(deps: ApiDeps, allowedOrigins: string[]): HttpApp {
  return createHttpApp(buildRouter(deps), { allowedOrigins });
}
