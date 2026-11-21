import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listEnv, requireEnv } from '../config/env';
import { sharedDocumentClient } from '../data/client';
import { createRepositories } from '../data/repositories';
import { createApi } from '../http/api';
import type { HttpApp } from '../http/app';
import { newOrderId } from '../lib/ids';
import { OrderService } from '../orders/order-service';
import { sharedSearchClient } from '../search/client';
import { searchIndexName } from '../search/index-definition';
import { SearchService } from '../search/search-service';
import { stepFunctionsStarterFromEnv } from '../workflow/starter';

/**
 * REST API entry point: one Lambda behind an API Gateway REST API with proxy
 * integration and a Cognito authorizer. Routing happens in src/http/router.ts.
 */
let app: HttpApp | undefined;

function init(): HttpApp {
  const repos = createRepositories(sharedDocumentClient(), requireEnv('TABLE_NAME'));
  const now = () => new Date();
  const orderService = new OrderService({
    repos,
    workflow: stepFunctionsStarterFromEnv(requireEnv('STATE_MACHINE_ARN')),
    now,
    newOrderId,
  });
  const search = new SearchService(sharedSearchClient(), searchIndexName());
  return createApi({ ...repos, orderService, search, now }, listEnv('CORS_ALLOWED_ORIGINS', ['*']));
}

export const handler = (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  app ??= init();
  return app(event);
};
