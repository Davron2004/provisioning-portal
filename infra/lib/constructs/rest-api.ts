import { Duration, type RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccessLogFormat,
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  EndpointType,
  LambdaIntegration,
  LogGroupLogDestination,
  MethodLoggingLevel,
  ResponseType,
  RestApi as ApiGatewayRestApi,
} from 'aws-cdk-lib/aws-apigateway';
import type { IUserPool } from 'aws-cdk-lib/aws-cognito';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import type { PortalConfig } from '../config';
import { PortalFunction } from './portal-function';

export interface RestApiProps {
  stage: string;
  table: ITableV2;
  userPool: IUserPool;
  stateMachine: IStateMachine;
  searchEndpoint: string;
  /** The web app's origin: CORS preflight, gateway responses and the Lambda's CORS header. */
  allowedOrigin: string;
  assistant: PortalConfig['assistant'];
  throttle: PortalConfig['apiThrottle'];
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/** Body of the 401 the Cognito authorizer returns; same shape as every API error. */
export const UNAUTHORIZED_BODY = '{"error":{"code":"unauthorized","message":"Unauthorized"}}';

/**
 * REST API: one `{proxy+}` resource proxied to http.ts behind a Cognito user
 * pool authorizer. Preflight (OPTIONS) is answered by API Gateway without
 * auth. Errors API Gateway produces itself (401, throttling, 5xx) get the API's
 * JSON error shape and CORS headers, so the browser can read them.
 */
export class RestApi extends Construct {
  readonly api: ApiGatewayRestApi;
  readonly handler: PortalFunction<'http'>;
  /** Base URL without a trailing slash (RuntimeConfig.apiBaseUrl). */
  readonly url: string;
  /** `https://` origin, for the CSP. */
  readonly origin: string;

  constructor(scope: Construct, id: string, props: RestApiProps) {
    super(scope, id);
    const { assistant } = props;

    this.handler = new PortalFunction(this, 'Handler', {
      handler: 'http',
      memorySize: 1024,
      // Just above API Gateway's 29 s integration timeout; the assistant is the slow path.
      timeout: Duration.seconds(30),
      logRetention: props.logRetention,
      removalPolicy: props.removalPolicy,
      environment: {
        TABLE_NAME: props.table.tableName,
        STATE_MACHINE_ARN: props.stateMachine.stateMachineArn,
        OPENSEARCH_ENDPOINT: props.searchEndpoint,
        OPENSEARCH_SERVICE: 'es',
        CORS_ALLOWED_ORIGINS: props.allowedOrigin,
        ASSISTANT_PROVIDER: assistant.provider,
        ASSISTANT_MODEL: assistant.model,
        BEDROCK_REGION: assistant.provider === 'bedrock' ? assistant.bedrockRegion : undefined,
        ANTHROPIC_API_KEY_PARAM:
          assistant.provider === 'anthropic' ? assistant.anthropicApiKeyParam : undefined,
      },
    });

    const accessLogs = new LogGroup(this, 'AccessLogs', {
      retention: props.logRetention,
      removalPolicy: props.removalPolicy,
    });
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [props.userPool],
      identitySource: 'method.request.header.Authorization',
    });

    this.api = new ApiGatewayRestApi(this, 'Api', {
      restApiName: `provisioning-portal-${props.stage}`,
      description: 'Provisioning portal REST API',
      endpointTypes: [EndpointType.REGIONAL],
      // Account-level role API Gateway needs to write access logs.
      cloudWatchRole: true,
      cloudWatchRoleRemovalPolicy: props.removalPolicy,
      deployOptions: {
        stageName: props.stage,
        throttlingRateLimit: props.throttle.rateLimit,
        throttlingBurstLimit: props.throttle.burstLimit,
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.OFF,
        dataTraceEnabled: false,
        accessLogDestination: new LogGroupLogDestination(accessLogs),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
      defaultMethodOptions: { authorizer, authorizationType: AuthorizationType.COGNITO },
      defaultCorsPreflightOptions: {
        allowOrigins: [props.allowedOrigin],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: Duration.hours(1),
      },
    });

    this.api.root
      .addResource('{proxy+}')
      .addMethod('ANY', new LambdaIntegration(this.handler, { allowTestInvoke: false }));

    const corsHeaders = {
      'Access-Control-Allow-Origin': `'${props.allowedOrigin}'`,
      Vary: "'Origin'",
    };
    this.api.addGatewayResponse('Unauthorized', {
      type: ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: corsHeaders,
      templates: { 'application/json': UNAUTHORIZED_BODY },
    });
    this.api.addGatewayResponse('Default4xx', {
      type: ResponseType.DEFAULT_4XX,
      responseHeaders: corsHeaders,
      templates: {
        'application/json':
          '{"error":{"code":"bad_request","message":$context.error.messageString}}',
      },
    });
    this.api.addGatewayResponse('Default5xx', {
      type: ResponseType.DEFAULT_5XX,
      responseHeaders: corsHeaders,
      templates: {
        'application/json': '{"error":{"code":"internal","message":$context.error.messageString}}',
      },
    });

    const { region, urlSuffix } = Stack.of(this);
    this.origin = `https://${this.api.restApiId}.execute-api.${region}.${urlSuffix}`;
    this.url = `${this.origin}/${this.api.deploymentStage.stageName}`;
  }
}
