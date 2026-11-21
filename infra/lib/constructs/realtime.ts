import { type RemovalPolicy, Stack } from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import type { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { PortalFunction } from './portal-function';

export interface RealtimeProps {
  stage: string;
  table: ITableV2;
  userPool: IUserPool;
  userPoolClient: IUserPoolClient;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/**
 * WebSocket API for live order updates. `$connect` is guarded by a Lambda
 * REQUEST authorizer reading the ID token from `?token=` (browsers cannot set
 * headers on the handshake); every route is handled by ws.ts, and client
 * messages are routed on `$request.body.action`.
 */
export class Realtime extends Construct {
  readonly api: WebSocketApi;
  readonly stage: WebSocketStage;
  readonly handler: PortalFunction<'ws'>;
  readonly authorizerFunction: PortalFunction<'wsAuthorizer'>;
  /** `wss://` URL clients connect to. */
  readonly url: string;
  /** `wss://` origin, for the CSP. */
  readonly origin: string;
  /** `https://` endpoint of the API Gateway Management API (WS_MANAGEMENT_ENDPOINT). */
  readonly managementEndpoint: string;

  constructor(scope: Construct, id: string, props: RealtimeProps) {
    super(scope, id);
    const common = { logRetention: props.logRetention, removalPolicy: props.removalPolicy };

    this.authorizerFunction = new PortalFunction(this, 'Authorizer', {
      ...common,
      handler: 'wsAuthorizer',
      environment: {
        AUTH_MODE: 'cognito',
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
      },
    });
    this.handler = new PortalFunction(this, 'Handler', {
      ...common,
      handler: 'ws',
      environment: { TABLE_NAME: props.table.tableName },
    });

    const integration = new WebSocketLambdaIntegration('Handler', this.handler);
    this.api = new WebSocketApi(this, 'Api', {
      apiName: `provisioning-portal-${props.stage}-ws`,
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: {
        integration,
        authorizer: new WebSocketLambdaAuthorizer('TokenAuthorizer', this.authorizerFunction, {
          identitySource: ['route.request.querystring.token'],
        }),
      },
      disconnectRouteOptions: { integration },
      defaultRouteOptions: { integration },
    });
    this.stage = new WebSocketStage(this, 'Stage', {
      webSocketApi: this.api,
      stageName: props.stage,
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });

    const { region, urlSuffix } = Stack.of(this);
    const host = `${this.api.apiId}.execute-api.${region}.${urlSuffix}`;
    this.origin = `wss://${host}`;
    this.url = this.stage.url;
    this.managementEndpoint = this.stage.callbackUrl;
    this.handler.setEnv('WS_MANAGEMENT_ENDPOINT', this.managementEndpoint);
  }
}
