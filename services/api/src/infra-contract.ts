/**
 * What the infrastructure (CDK) needs from the API code, in one import:
 *
 *   import { TABLE_DEFINITION, HANDLERS, orderWorkflowDefinition } from '@provisioning/api/infra';
 *
 * Every value here is also used by the code itself or the local harness, so
 * infrastructure and runtime cannot drift apart silently.
 */
export { TABLE_DEFINITION, createTableInput } from './data/table';
export {
  orderWorkflowDefinition,
  PROVISION_LINE_RETRY,
  LAMBDA_SERVICE_RETRY,
  MAP_MAX_CONCURRENCY,
  type WorkflowFunctionArns,
} from './workflow/definition';
export { STREAM_FILTER_PATTERNS } from './streams/records';
export { SEARCH_INDEX_BODY } from './search/index-definition';
export { DEFAULT_MODELS as ASSISTANT_DEFAULT_MODELS } from './assistant/from-env';

type Access =
  | 'table:read'
  | 'table:write'
  | 'stream:read'
  | 'states:StartExecution'
  | 'execute-api:ManageConnections'
  | 'es:ESHttpGet/Post/Put/Delete (index only)'
  | 'bedrock-mantle:CreateInference'
  | 'ssm:GetParameter (ANTHROPIC_API_KEY_PARAM)';

interface HandlerSpec {
  /** Entry file relative to services/api. Each exports `handler`. */
  entry: string;
  trigger: string;
  env: readonly string[];
  access: readonly Access[];
}

/** Lambda entry points with the environment and permissions each one needs. */
export const HANDLERS = {
  http: {
    entry: 'src/handlers/http.ts',
    trigger: 'API Gateway REST API, {proxy+} ANY, Cognito user pool authorizer',
    env: [
      'TABLE_NAME',
      'STATE_MACHINE_ARN',
      'OPENSEARCH_ENDPOINT',
      'OPENSEARCH_SERVICE',
      'CORS_ALLOWED_ORIGINS',
      'ASSISTANT_PROVIDER',
      'ASSISTANT_MODEL',
      'BEDROCK_REGION',
      'ANTHROPIC_API_KEY_PARAM',
    ],
    access: [
      'table:read',
      'table:write',
      'states:StartExecution',
      'es:ESHttpGet/Post/Put/Delete (index only)',
      'bedrock-mantle:CreateInference',
      'ssm:GetParameter (ANTHROPIC_API_KEY_PARAM)',
    ],
  },
  ws: {
    entry: 'src/handlers/ws.ts',
    trigger:
      'API Gateway WebSocket API: $connect, $disconnect, $default (route selection $request.body.action)',
    env: ['TABLE_NAME', 'WS_MANAGEMENT_ENDPOINT'],
    access: ['table:read', 'table:write', 'execute-api:ManageConnections'],
  },
  wsAuthorizer: {
    entry: 'src/handlers/ws-authorizer.ts',
    trigger:
      'WebSocket $connect REQUEST authorizer, identity source route.request.querystring.token',
    env: ['AUTH_MODE', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'],
    access: [],
  },
  validateOrder: {
    entry: 'src/handlers/workflow/validate-order.ts',
    trigger: 'Step Functions task',
    env: ['TABLE_NAME'],
    access: ['table:read', 'table:write'],
  },
  provisionLine: {
    entry: 'src/handlers/workflow/provision-line.ts',
    trigger: 'Step Functions task in the Map, also the Catch target',
    env: ['TABLE_NAME', 'PROVISIONING_TRANSIENT_FAILURE_RATE', 'PROVISIONING_STEP_DELAY_MS'],
    access: ['table:read', 'table:write'],
  },
  finalizeOrder: {
    entry: 'src/handlers/workflow/finalize-order.ts',
    trigger: 'Step Functions task',
    env: ['TABLE_NAME'],
    access: ['table:read', 'table:write'],
  },
  searchIndexer: {
    entry: 'src/handlers/streams/search-indexer.ts',
    trigger: 'DynamoDB stream, filters STREAM_FILTER_PATTERNS.searchIndexer',
    env: ['TABLE_NAME', 'OPENSEARCH_ENDPOINT', 'OPENSEARCH_SERVICE', 'OPENSEARCH_INDEX'],
    access: ['table:read', 'stream:read', 'es:ESHttpGet/Post/Put/Delete (index only)'],
  },
  orderNotifier: {
    entry: 'src/handlers/streams/order-notifier.ts',
    trigger: 'DynamoDB stream, filters STREAM_FILTER_PATTERNS.orderNotifier',
    env: ['TABLE_NAME', 'WS_MANAGEMENT_ENDPOINT'],
    access: ['table:read', 'table:write', 'stream:read', 'execute-api:ManageConnections'],
  },
  seedDemoData: {
    entry: 'src/handlers/seed-demo-data.ts',
    trigger: 'CloudFormation custom resource on stack create, non-production stages only',
    env: ['TABLE_NAME'],
    access: ['table:read', 'table:write'],
  },
} as const satisfies Record<string, HandlerSpec>;
