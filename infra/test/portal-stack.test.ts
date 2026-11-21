import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HANDLERS,
  MAP_MAX_CONCURRENCY,
  PROVISION_LINE_RETRY,
  LAMBDA_SERVICE_RETRY,
  STREAM_FILTER_PATTERNS,
  TABLE_DEFINITION,
} from '@provisioning/api/infra';
import { UNAUTHORIZED_BODY } from '../lib/constructs/rest-api';
import {
  actionsOf,
  flattenJoin,
  functionId,
  onlyResource,
  roleIdOf,
  statementsOf,
  synthPortal,
} from './helpers';

const FUNCTIONS = {
  http: 'Api/Handler',
  ws: 'Realtime/Handler',
  wsAuthorizer: 'Realtime/Authorizer',
  validateOrder: 'Workflow/ValidateOrder',
  provisionLine: 'Workflow/ProvisionLine',
  finalizeOrder: 'Workflow/FinalizeOrder',
  searchIndexer: 'Streams/SearchIndexer',
  orderNotifier: 'Streams/OrderNotifier',
} as const satisfies Record<keyof typeof HANDLERS, string>;

/** Declared variables the stack leaves unset on purpose: the code's defaults apply. */
const OPTIONAL_ENV = new Set([
  'PROVISIONING_TRANSIENT_FAILURE_RATE',
  'PROVISIONING_STEP_DELAY_MS',
  // Only for the provider not in use.
  'ANTHROPIC_API_KEY_PARAM',
]);

describe('PortalStack (dev, defaults)', () => {
  let synth: ReturnType<typeof synthPortal>;
  beforeAll(() => {
    synth = synthPortal();
  });
  const template = () => synth.template;
  const roleOf = (handler: keyof typeof FUNCTIONS) =>
    roleIdOf(template(), functionId(template(), FUNCTIONS[handler]));

  describe('DynamoDB table', () => {
    it('mirrors TABLE_DEFINITION: keys, GSIs, stream, TTL, on-demand, PITR', () => {
      const { properties } = onlyResource(template(), 'AWS::DynamoDB::GlobalTable');
      expect(properties.KeySchema).toEqual([
        { AttributeName: TABLE_DEFINITION.partitionKey, KeyType: 'HASH' },
        { AttributeName: TABLE_DEFINITION.sortKey, KeyType: 'RANGE' },
      ]);
      expect(properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect(properties.StreamSpecification).toEqual({ StreamViewType: 'NEW_AND_OLD_IMAGES' });
      expect(properties.TimeToLiveSpecification).toEqual({
        AttributeName: 'expiresAt',
        Enabled: true,
      });
      const gsis = properties.GlobalSecondaryIndexes as { IndexName: string; KeySchema: unknown }[];
      expect(gsis.map((g) => g.IndexName)).toEqual(['GSI1', 'GSI2']);
      expect(gsis[0]!.KeySchema).toEqual([
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ]);
      expect(JSON.stringify(properties.Replicas)).toContain('"PointInTimeRecoveryEnabled":true');
    });

    it('is deleted with a dev stack', () => {
      template().hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Delete' });
    });
  });

  describe('Lambda functions', () => {
    it('run every handler on Node.js 22, ARM64, with X-Ray tracing', () => {
      const all = template().findResources('AWS::Lambda::Function');
      for (const path of Object.values(FUNCTIONS)) {
        const props = all[functionId(template(), path)]!.Properties;
        expect(props.Runtime, path).toBe('nodejs22.x');
        expect(props.Architectures, path).toEqual(['arm64']);
        expect(props.TracingConfig, path).toEqual({ Mode: 'Active' });
        expect(props.Handler, path).toBe('index.handler');
      }
    });

    it('set every environment variable each handler declares', () => {
      const all = template().findResources('AWS::Lambda::Function');
      for (const [name, path] of Object.entries(FUNCTIONS)) {
        const vars = all[functionId(template(), path)]!.Properties.Environment.Variables;
        const declared = HANDLERS[name as keyof typeof HANDLERS].env as readonly string[];
        const required = declared.filter((key) => !OPTIONAL_ENV.has(key));
        expect(Object.keys(vars).sort(), path).toEqual(expect.arrayContaining(required.sort()));
        const unexpected = Object.keys(vars).filter(
          (key) => !declared.includes(key) && !['LOG_LEVEL', 'NODE_OPTIONS'].includes(key),
        );
        expect(unexpected, path).toEqual([]);
      }
    });

    it('configure the assistant for Bedrock by default', () => {
      const vars =
        template().toJSON().Resources[functionId(template(), FUNCTIONS.http)].Properties.Environment
          .Variables;
      expect(vars).toMatchObject({
        ASSISTANT_PROVIDER: 'bedrock',
        ASSISTANT_MODEL: 'anthropic.claude-opus-5-5',
        BEDROCK_REGION: 'ca-central-1',
        OPENSEARCH_SERVICE: 'es',
      });
      expect(flattenJoin(vars.CORS_ALLOWED_ORIGINS)).toMatch(
        /^https:\/\/<WebDistribution\w+\.DomainName>$/,
      );
      expect(flattenJoin(vars.OPENSEARCH_ENDPOINT)).toMatch(
        /^https:\/\/<SearchDomain\w+\.DomainEndpoint>$/,
      );
    });

    it('keep logs for two weeks in dev', () => {
      template().allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
    });
  });

  describe('IAM follows the access each handler declares', () => {
    it('lets only the REST handler start workflow executions and call Bedrock', () => {
      for (const handler of Object.keys(FUNCTIONS) as (keyof typeof FUNCTIONS)[]) {
        const actions = actionsOf(statementsOf(template(), roleOf(handler)));
        const isHttp = handler === 'http';
        expect(actions.includes('states:StartExecution'), handler).toBe(isHttp);
        expect(actions.includes('bedrock-mantle:CreateInference'), handler).toBe(isHttp);
        expect(actions.includes('ssm:GetParameter'), handler).toBe(false);
      }
    });

    it('grants ManageConnections to ws and the notifier, on this stage only', () => {
      for (const handler of ['ws', 'orderNotifier'] as const) {
        const statement = statementsOf(template(), roleOf(handler)).find(
          (s) => s.Action === 'execute-api:ManageConnections',
        );
        expect(flattenJoin(statement?.Resource), handler).toMatch(
          /:<RealtimeApi\w+>\/dev\/POST\/@connections\/\*$/,
        );
      }
      expect(actionsOf(statementsOf(template(), roleOf('http')))).not.toContain(
        'execute-api:ManageConnections',
      );
    });

    it('scopes Bedrock to the account’s bedrock-mantle projects in the Bedrock region', () => {
      const statement = statementsOf(template(), roleOf('http')).find(
        (s) => s.Action === 'bedrock-mantle:CreateInference',
      );
      expect(statement?.Resource).toBe(
        'arn:aws:bedrock-mantle:ca-central-1:123456789012:project/*',
      );
    });

    it('gives the authorizer no data access', () => {
      const actions = actionsOf(statementsOf(template(), roleOf('wsAuthorizer')));
      expect(actions.filter((a) => !a.startsWith('xray:'))).toEqual([]);
    });

    it('lets the indexer write the search index and the REST handler only read it', () => {
      const esActions = (handler: keyof typeof FUNCTIONS) =>
        actionsOf(statementsOf(template(), roleOf(handler))).filter((a) => a.startsWith('es:'));
      expect(esActions('searchIndexer')).toEqual(
        expect.arrayContaining(['es:ESHttpPut', 'es:ESHttpDelete', 'es:ESHttpPost']),
      );
      expect(esActions('http').sort()).toEqual(['es:ESHttpGet', 'es:ESHttpHead', 'es:ESHttpPost']);
      expect(esActions('ws')).toEqual([]);
      const indexer = statementsOf(template(), roleOf('searchIndexer')).find((s) =>
        actionsOf([s]).includes('es:ESHttpPut'),
      );
      expect((indexer?.Resource as unknown[]).map(flattenJoin)).toEqual([
        expect.stringMatching(/\.Arn>\/provisioning$/),
        expect.stringMatching(/\.Arn>\/provisioning\/\*$/),
      ]);
    });
  });

  describe('OpenSearch domain', () => {
    it('is one t3.small.search node with 10 GiB gp3, no masters, no zone awareness', () => {
      const { properties } = onlyResource(template(), 'AWS::OpenSearchService::Domain');
      expect(properties.EngineVersion).toBe('OpenSearch_2.19');
      expect(properties.ClusterConfig).toEqual({
        InstanceType: 't3.small.search',
        InstanceCount: 1,
        DedicatedMasterEnabled: false,
        ZoneAwarenessEnabled: false,
        MultiAZWithStandbyEnabled: false,
      });
      expect(properties.EBSOptions).toEqual({
        EBSEnabled: true,
        VolumeSize: 10,
        VolumeType: 'gp3',
      });
    });

    it('is encrypted at rest and in transit, HTTPS only with TLS 1.2+', () => {
      const { properties } = onlyResource(template(), 'AWS::OpenSearchService::Domain');
      expect(properties.EncryptionAtRestOptions).toEqual({ Enabled: true });
      expect(properties.NodeToNodeEncryptionOptions).toEqual({ Enabled: true });
      expect(properties.DomainEndpointOptions).toEqual({
        EnforceHTTPS: true,
        TLSSecurityPolicy: 'Policy-Min-TLS-1-2-PFS-2023-10',
      });
    });

    it('admits only the indexer and REST handler roles', () => {
      const { properties } = onlyResource(template(), 'AWS::OpenSearchService::Domain');
      const policy = properties.AccessPolicies as {
        Statement: { Principal: { AWS: { 'Fn::GetAtt': [string, string] }[] }; Resource: string }[];
      };
      expect(policy.Statement).toHaveLength(1);
      const principals = policy.Statement[0]!.Principal.AWS.map((p) => p['Fn::GetAtt'][0]).sort();
      expect(principals).toEqual([roleOf('http'), roleOf('searchIndexer')].sort());
      expect(policy.Statement[0]!.Resource).toBe(
        'arn:aws:es:ca-central-1:123456789012:domain/provisioning-dev/*',
      );
    });
  });

  describe('order workflow', () => {
    const definition = () => {
      const { properties } = onlyResource(template(), 'AWS::StepFunctions::StateMachine');
      return JSON.parse(flattenJoin(properties.DefinitionString)) as {
        States: Record<string, Record<string, unknown>>;
      };
    };
    const retrier = (p: typeof PROVISION_LINE_RETRY | typeof LAMBDA_SERVICE_RETRY) => ({
      ErrorEquals: [...p.errorEquals],
      IntervalSeconds: p.intervalSeconds,
      BackoffRate: p.backoffRate,
      MaxAttempts: p.maxAttempts,
    });

    it('is a Standard state machine with tracing and logging', () => {
      const { properties } = onlyResource(template(), 'AWS::StepFunctions::StateMachine');
      expect(properties.StateMachineType).toBe('STANDARD');
      expect(properties.TracingConfiguration).toEqual({ Enabled: true });
      expect(properties.LoggingConfiguration).toMatchObject({
        Level: 'ERROR',
        IncludeExecutionData: true,
      });
    });

    it('provisions lines in a Map with PROVISION_LINE_RETRY and a Catch', () => {
      const map = definition().States.ProvisionLines as {
        MaxConcurrency: number;
        ItemProcessor: { States: Record<string, { Retry: unknown[]; Catch?: unknown[] }> };
      };
      expect(map.MaxConcurrency).toBe(MAP_MAX_CONCURRENCY);
      const task = map.ItemProcessor.States.ProvisionLine!;
      expect(task.Retry).toEqual([retrier(PROVISION_LINE_RETRY), retrier(LAMBDA_SERVICE_RETRY)]);
      expect(task.Catch).toEqual([
        { ErrorEquals: ['States.ALL'], ResultPath: '$.failure', Next: 'RecordLineFailure' },
      ]);
    });

    it('invokes the three task Lambdas, and the state machine may invoke them', () => {
      const states = definition().States;
      expect(states.ValidateOrder!.Resource).toMatch(/^<WorkflowValidateOrder\w+\.Arn>$/);
      expect(states.FinalizeOrder!.Resource).toMatch(/^<WorkflowFinalizeOrder\w+\.Arn>$/);
      const { logicalId } = onlyResource(template(), 'AWS::StepFunctions::StateMachine');
      const smRole = (
        template().toJSON().Resources[logicalId].Properties.RoleArn as {
          'Fn::GetAtt': [string, string];
        }
      )['Fn::GetAtt'][0];
      const invoke = statementsOf(template(), smRole).filter(
        (s) => s.Action === 'lambda:InvokeFunction',
      );
      const targets = invoke
        .flatMap((s) => [s.Resource].flat())
        .map(flattenJoin)
        .join(' ');
      for (const fn of ['ValidateOrder', 'ProvisionLine', 'FinalizeOrder']) {
        expect(targets).toContain(`<Workflow${fn}`);
      }
    });
  });

  describe('DynamoDB stream consumers', () => {
    const mapping = (fnPath: string) => {
      const fnId = functionId(template(), fnPath);
      const found = Object.values(
        template().findResources('AWS::Lambda::EventSourceMapping', {
          Properties: { FunctionName: { Ref: fnId } },
        }),
      );
      expect(found).toHaveLength(1);
      return found[0]!.Properties as Record<string, unknown>;
    };

    it.each([
      ['searchIndexer', FUNCTIONS.searchIndexer],
      ['orderNotifier', FUNCTIONS.orderNotifier],
    ] as const)('%s filters with STREAM_FILTER_PATTERNS and has a DLQ', (name, path) => {
      const props = mapping(path);
      const filters = (props.FilterCriteria as { Filters: { Pattern: string }[] }).Filters;
      expect(filters.map((f) => JSON.parse(f.Pattern))).toEqual(STREAM_FILTER_PATTERNS[name]);
      expect(props.BisectBatchOnFunctionError).toBe(true);
      expect(props.MaximumRetryAttempts).toBeGreaterThan(0);
      expect(props.StartingPosition).toBe('TRIM_HORIZON');
      const destination = (props.DestinationConfig as { OnFailure: { Destination: unknown } })
        .OnFailure.Destination;
      expect(flattenJoin(destination)).toMatch(/^<Streams\w+Dlq\w+\.Arn>$/);
    });

    it('encrypts the DLQs and requires TLS', () => {
      template().allResourcesProperties('AWS::SQS::Queue', {
        SqsManagedSseEnabled: true,
        MessageRetentionPeriod: 14 * 24 * 3600,
      });
      template().allResourcesProperties('AWS::SQS::QueuePolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ]),
        },
      });
    });
  });

  describe('REST API', () => {
    it('proxies everything to the http Lambda behind the Cognito authorizer', () => {
      template().hasResourceProperties('AWS::ApiGateway::Authorizer', {
        Type: 'COGNITO_USER_POOLS',
        IdentitySource: 'method.request.header.Authorization',
      });
      template().hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: '{proxy+}' });
      template().hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'ANY',
        AuthorizationType: 'COGNITO_USER_POOLS',
        Integration: { Type: 'AWS_PROXY' },
      });
    });

    it('answers CORS preflight without auth, only for the web origin', () => {
      const methods = Object.values(template().findResources('AWS::ApiGateway::Method'));
      const options = methods.filter((m) => m.Properties.HttpMethod === 'OPTIONS');
      expect(options.length).toBeGreaterThan(0);
      for (const m of options) {
        expect(m.Properties.AuthorizationType).toBe('NONE');
        expect(m.Properties.AuthorizerId).toBeUndefined();
        const origin =
          m.Properties.Integration.IntegrationResponses[0].ResponseParameters[
            'method.response.header.Access-Control-Allow-Origin'
          ];
        expect(flattenJoin(origin)).toMatch(/^'https:\/\/<WebDistribution\w+\.DomainName>'$/);
      }
      const secured = methods.filter((m) => m.Properties.HttpMethod !== 'OPTIONS');
      for (const m of secured) expect(m.Properties.AuthorizationType).toBe('COGNITO_USER_POOLS');
    });

    it('returns the API error shape with CORS headers for gateway 401s', () => {
      template().hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
        ResponseType: 'UNAUTHORIZED',
        StatusCode: '401',
        ResponseTemplates: { 'application/json': UNAUTHORIZED_BODY },
        ResponseParameters: Match.objectLike({
          'gatewayresponse.header.Access-Control-Allow-Origin': Match.anyValue(),
        }),
      });
      expect(JSON.parse(UNAUTHORIZED_BODY)).toEqual({
        error: { code: 'unauthorized', message: 'Unauthorized' },
      });
      for (const type of ['DEFAULT_4XX', 'DEFAULT_5XX']) {
        template().hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
          ResponseType: type,
        });
      }
    });

    it('throttles the stage, traces and writes access logs', () => {
      template().hasResourceProperties('AWS::ApiGateway::Stage', {
        StageName: 'dev',
        TracingEnabled: true,
        AccessLogSetting: Match.objectLike({ DestinationArn: Match.anyValue() }),
        MethodSettings: [
          Match.objectLike({
            HttpMethod: '*',
            ResourcePath: '/*',
            ThrottlingRateLimit: 10,
            ThrottlingBurstLimit: 20,
            DataTraceEnabled: false,
          }),
        ],
      });
    });
  });

  describe('WebSocket API', () => {
    it('routes on $request.body.action and auto-deploys the stage', () => {
      template().hasResourceProperties('AWS::ApiGatewayV2::Api', {
        ProtocolType: 'WEBSOCKET',
        RouteSelectionExpression: '$request.body.action',
      });
      template().hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        StageName: 'dev',
        AutoDeploy: true,
      });
    });

    it('authorizes $connect with the token query parameter; other routes need no auth', () => {
      template().hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'REQUEST',
        IdentitySource: ['route.request.querystring.token'],
      });
      const routes = Object.values(template().findResources('AWS::ApiGatewayV2::Route')).map(
        (r) => r.Properties,
      );
      expect(routes.map((r) => r.RouteKey).sort()).toEqual(['$connect', '$default', '$disconnect']);
      for (const route of routes) {
        expect(route.AuthorizationType).toBe(route.RouteKey === '$connect' ? 'CUSTOM' : 'NONE');
      }
    });

    it('passes the management endpoint to the handlers that push messages', () => {
      const all = template().toJSON().Resources;
      for (const path of [FUNCTIONS.ws, FUNCTIONS.orderNotifier]) {
        const value =
          all[functionId(template(), path)].Properties.Environment.Variables.WS_MANAGEMENT_ENDPOINT;
        expect(flattenJoin(value)).toMatch(
          /^https:\/\/<RealtimeApi\w+>\.execute-api\.ca-central-1\.<AWS::URLSuffix>\/dev$/,
        );
      }
    });
  });

  describe('Cognito', () => {
    it('allows no self sign-up and requires a strong password', () => {
      template().hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
        UsernameAttributes: ['email'],
        Policies: {
          PasswordPolicy: Match.objectLike({
            MinimumLength: 12,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          }),
        },
      });
    });

    it('has a public client for USER_PASSWORD_AUTH', () => {
      template().hasResourceProperties('AWS::Cognito::UserPoolClient', {
        GenerateSecret: false,
        ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
        PreventUserExistenceErrors: 'ENABLED',
      });
    });
  });

  describe('web hosting', () => {
    it('keeps the bucket private, encrypted and TLS-only', () => {
      template().hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
      template().hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
            Match.objectLike({
              Effect: 'Allow',
              Principal: { Service: 'cloudfront.amazonaws.com' },
              Action: 's3:GetObject',
            }),
          ]),
        },
      });
    });

    it('serves through CloudFront with OAC, HTTPS and SPA fallback', () => {
      onlyResource(template(), 'AWS::CloudFront::OriginAccessControl');
      const { properties } = onlyResource(template(), 'AWS::CloudFront::Distribution');
      const config = properties.DistributionConfig as Record<string, unknown> & {
        Origins: { OriginAccessControlId?: unknown }[];
        DefaultCacheBehavior: Record<string, unknown>;
      };
      expect(config.Origins[0]!.OriginAccessControlId).toBeDefined();
      expect(config.DefaultRootObject).toBe('index.html');
      expect(config.DefaultCacheBehavior.ViewerProtocolPolicy).toBe('redirect-to-https');
      expect(config.DefaultCacheBehavior.ResponseHeadersPolicyId).toBeDefined();
      expect(config.CustomErrorResponses).toEqual(
        [403, 404].map((code) => ({
          ErrorCode: code,
          ResponseCode: 200,
          ResponsePagePath: '/index.html',
          ErrorCachingMinTTL: 0,
        })),
      );
    });

    it('sends security headers and a CSP built from the app', () => {
      const { properties } = onlyResource(template(), 'AWS::CloudFront::ResponseHeadersPolicy');
      const config = properties.ResponseHeadersPolicyConfig as {
        SecurityHeadersConfig: Record<string, Record<string, unknown>>;
      };
      const security = config.SecurityHeadersConfig;
      expect(security.StrictTransportSecurity).toMatchObject({ AccessControlMaxAgeSec: 63072000 });
      expect(security.ContentTypeOptions).toEqual({ Override: true });
      expect(security.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true });
      expect(security.ReferrerPolicy).toMatchObject({
        ReferrerPolicy: 'strict-origin-when-cross-origin',
      });
      const csp = flattenJoin(security.ContentSecurityPolicy!.ContentSecurityPolicy);
      // The fixture index.html has one inline script; its hash is allowed, nothing else inline.
      expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/]+=*';/);
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(csp).toContain(
        "connect-src 'self' https://<ApiCD79AAA0>.execute-api.ca-central-1.<AWS::URLSuffix> " +
          'wss://<RealtimeApiD4415F9E>.execute-api.ca-central-1.<AWS::URLSuffix> ' +
          'https://cognito-idp.ca-central-1.amazonaws.com;',
      );
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('caches hashed bundles for a year and revalidates the shell and config.json', () => {
      const deployments = Object.values(
        template().findResources('Custom::CDKBucketDeployment'),
      ).map((d) => d.Properties);
      expect(deployments).toHaveLength(2);
      const assets = deployments.find((d) => !d.DistributionPaths)!;
      const shell = deployments.find((d) => d.DistributionPaths)!;
      expect(assets.SystemMetadata).toEqual({
        'cache-control': 'public, max-age=31536000, immutable',
      });
      expect(shell.SystemMetadata).toEqual({ 'cache-control': 'no-cache' });
      expect(shell.DistributionPaths).toEqual(
        expect.arrayContaining(['/index.html', '/config.json']),
      );
    });

    it('generates config.json for Cognito in AWS', () => {
      const shell = Object.values(template().findResources('Custom::CDKBucketDeployment')).find(
        (d) => d.Properties.DistributionPaths,
      )!;
      // Source.jsonData writes the RuntimeConfig with deploy-time markers for tokens.
      expect(shell.Properties.SourceMarkersConfig).toEqual([{}, { jsonEscape: true }]);
      const markers = JSON.stringify(shell.Properties.SourceMarkers);
      expect(markers).toContain('AuthUserPool');
      expect(markers).toContain('AuthUserPoolWebClient');
      expect(markers).toContain('RealtimeApi');
    });
  });

  describe('cost guardrails and alarms', () => {
    it('skips the budget with a warning when no email is given', () => {
      template().resourceCountIs('AWS::Budgets::Budget', 0);
      template().resourceCountIs('AWS::SNS::Topic', 0);
      Annotations.fromStack(synth.stack).hasWarning(
        '/Portal/Observability',
        Match.stringLikeRegexp('No budgetEmail'),
      );
    });

    it('alarms on every Lambda, workflow failures, both DLQs, API 5xx and search health', () => {
      const alarms = Object.values(template().findResources('AWS::CloudWatch::Alarm')).map(
        (a) => a.Properties as { MetricName: string; Namespace: string },
      );
      const count = (metric: string) => alarms.filter((a) => a.MetricName === metric).length;
      expect(count('Errors')).toBe(Object.keys(FUNCTIONS).length);
      expect(count('ExecutionsFailed')).toBe(1);
      expect(count('ApproximateNumberOfMessagesVisible')).toBe(2);
      expect(count('5XXError')).toBe(1);
      expect(count('ClusterStatus.red')).toBe(1);
      expect(count('FreeStorageSpace')).toBe(1);
    });
  });

  it('tags resources with project and stage', () => {
    template().hasResourceProperties('AWS::Lambda::Function', {
      Tags: Match.arrayWith([
        { Key: 'project', Value: 'provisioning-portal' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('outputs what the deploy and the smoke test need', () => {
    const outputs = Object.keys(template().toJSON().Outputs ?? {});
    expect(outputs).toEqual(
      expect.arrayContaining([
        'WebUrl',
        'ApiUrl',
        'WebSocketUrl',
        'UserPoolId',
        'UserPoolClientId',
        'StateMachineArn',
        'TableName',
        'SearchEndpoint',
      ]),
    );
  });
});

describe('PortalStack (prod, budget email, Claude API provider)', () => {
  let synth: ReturnType<typeof synthPortal>;
  beforeAll(() => {
    synth = synthPortal({
      context: {
        stage: 'prod',
        budgetEmail: 'ops@example.com',
        assistantProvider: 'anthropic',
      },
    });
  });
  const template = () => synth.template;

  it('retains stateful resources', () => {
    for (const type of [
      'AWS::DynamoDB::GlobalTable',
      'AWS::Cognito::UserPool',
      'AWS::OpenSearchService::Domain',
      'AWS::S3::Bucket',
    ]) {
      template().hasResource(type, { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
    }
    template().hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      Replicas: [Match.objectLike({ DeletionProtectionEnabled: true })],
    });
    template().resourceCountIs('Custom::S3AutoDeleteObjects', 0);
  });

  it('creates a $50 monthly budget alerting at 80% actual and 100% forecast', () => {
    template().hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'provisioning-portal-prod-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 50, Unit: 'USD' },
      },
      NotificationsWithSubscribers: [
        {
          Notification: {
            NotificationType: 'ACTUAL',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 80,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'ops@example.com' }],
        },
        {
          Notification: {
            NotificationType: 'FORECASTED',
            ComparisonOperator: 'GREATER_THAN',
            Threshold: 100,
            ThresholdType: 'PERCENTAGE',
          },
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'ops@example.com' }],
        },
      ],
    });
  });

  it('sends alarms to an email topic', () => {
    template().hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'ops@example.com',
    });
    template().allResourcesProperties('AWS::CloudWatch::Alarm', {
      AlarmActions: [{ Ref: Match.stringLikeRegexp('^ObservabilityAlarms') }],
    });
  });

  it('reads the Claude API key from its SSM parameter instead of calling Bedrock', () => {
    const fnId = functionId(template(), FUNCTIONS.http);
    const vars = template().toJSON().Resources[fnId].Properties.Environment.Variables;
    expect(vars).toMatchObject({
      ASSISTANT_PROVIDER: 'anthropic',
      ASSISTANT_MODEL: 'claude-opus-5-5',
      ANTHROPIC_API_KEY_PARAM: '/provisioning-portal/prod/anthropic-api-key',
    });
    expect(vars.BEDROCK_REGION).toBeUndefined();
    const statements = statementsOf(template(), roleIdOf(template(), fnId));
    expect(actionsOf(statements)).not.toContain('bedrock-mantle:CreateInference');
    const parameterArn =
      'arn:aws:ssm:ca-central-1:123456789012:parameter/provisioning-portal/prod/anthropic-api-key';
    expect(statements).toContainEqual(
      expect.objectContaining({ Action: 'ssm:GetParameter', Resource: parameterArn }),
    );
    expect(statements).toContainEqual(
      expect.objectContaining({
        Action: 'kms:Decrypt',
        Condition: {
          StringEquals: {
            'kms:ViaService': 'ssm.ca-central-1.amazonaws.com',
            'kms:EncryptionContext:PARAMETER_ARN': parameterArn,
          },
        },
      }),
    );
  });

  it('keeps logs for three months', () => {
    template().allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 90 });
  });
});
