import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { RuntimeConfig } from '@provisioning/contracts';
import { grantDeclaredAccess } from './access';
import { PROJECT, type PortalConfig } from './config';
import { Auth } from './constructs/auth';
import { Data } from './constructs/data';
import { Observability } from './constructs/observability';
import type { HandlerName, PortalFunction } from './constructs/portal-function';
import { Realtime } from './constructs/realtime';
import { RestApi } from './constructs/rest-api';
import { Search } from './constructs/search';
import { StreamConsumers } from './constructs/stream-consumers';
import { Web } from './constructs/web';
import { Workflow } from './constructs/workflow';

export interface PortalStackProps extends StackProps {
  config: PortalConfig;
  /** Angular build output to deploy. */
  webBuildDir: string;
}

/**
 * The whole application for one stage: data, search, workflow, both APIs,
 * auth, web hosting and alarms. One stack, because every part references the
 * others (the web app's CSP names the APIs, the API's CORS names the web app)
 * and they are deployed and torn down together.
 */
export class PortalStack extends Stack {
  constructor(scope: Construct, id: string, props: PortalStackProps) {
    super(scope, id, props);
    const { config } = props;
    const retain = config.isProduction;
    const common = { logRetention: config.logRetention, removalPolicy: config.removalPolicy };
    Tags.of(this).add('project', PROJECT);
    Tags.of(this).add('stage', config.stage);

    const { table } = new Data(this, 'Data', {
      removalPolicy: config.removalPolicy,
      deletionProtection: retain,
    });
    const auth = new Auth(this, 'Auth', {
      stage: config.stage,
      removalPolicy: config.removalPolicy,
      deletionProtection: retain,
    });
    const search = new Search(this, 'Search', {
      stage: config.stage,
      removalPolicy: config.removalPolicy,
    });
    const web = new Web(this, 'Web', { ...common, buildDir: props.webBuildDir });

    const workflow = new Workflow(this, 'Workflow', { ...common, stage: config.stage, table });
    const realtime = new Realtime(this, 'Realtime', {
      ...common,
      stage: config.stage,
      table,
      userPool: auth.userPool,
      userPoolClient: auth.client,
    });
    const api = new RestApi(this, 'Api', {
      ...common,
      stage: config.stage,
      table,
      userPool: auth.userPool,
      stateMachine: workflow.stateMachine,
      searchEndpoint: search.endpoint,
      allowedOrigin: web.url,
      assistant: config.assistant,
      throttle: config.apiThrottle,
    });
    const streams = new StreamConsumers(this, 'Streams', {
      ...common,
      table,
      searchEndpoint: search.endpoint,
      wsManagementEndpoint: realtime.managementEndpoint,
    });

    const functions: Record<string, PortalFunction<HandlerName>> = {
      Http: api.handler,
      Ws: realtime.handler,
      WsAuthorizer: realtime.authorizerFunction,
      ValidateOrder: workflow.validateOrder,
      ProvisionLine: workflow.provisionLine,
      FinalizeOrder: workflow.finalizeOrder,
      SearchIndexer: streams.searchIndexer,
      OrderNotifier: streams.orderNotifier,
    };
    for (const fn of Object.values(functions)) {
      grantDeclaredAccess(fn, {
        table,
        stateMachine: workflow.stateMachine,
        webSocketApi: realtime.api,
        webSocketStage: realtime.stage.stageName,
        search,
        assistant: config.assistant,
      });
    }

    const runtimeConfig: RuntimeConfig = {
      apiBaseUrl: api.url,
      websocketUrl: realtime.url,
      auth: {
        mode: 'cognito',
        region: this.region,
        userPoolId: auth.userPool.userPoolId,
        userPoolClientId: auth.client.userPoolClientId,
      },
      environment: 'aws',
    };
    web.deploy(runtimeConfig, [api.origin, realtime.origin, auth.cognitoEndpoint]);

    new Observability(this, 'Observability', {
      stage: config.stage,
      email: config.budgetEmail,
      monthlyBudgetUsd: config.monthlyBudgetUsd,
      functions: Object.entries(functions).map(([id, fn]) => ({ id, fn })),
      stateMachine: workflow.stateMachine,
      deadLetterQueues: [
        { id: 'SearchIndexerDlq', queue: streams.searchIndexerDlq },
        { id: 'OrderNotifierDlq', queue: streams.orderNotifierDlq },
      ],
      restApi: api.api,
      searchDomain: search.domain,
    });

    const output = (id: string, value: string, description: string) =>
      new CfnOutput(this, id, { value, description });
    output('WebUrl', web.url, 'Web app (CloudFront)');
    output('ApiUrl', api.url, 'REST API base URL');
    output('WebSocketUrl', realtime.url, 'WebSocket API URL');
    output('UserPoolId', auth.userPool.userPoolId, 'Cognito user pool id');
    output('UserPoolClientId', auth.client.userPoolClientId, 'Cognito app client id (web)');
    output('StateMachineArn', workflow.stateMachine.stateMachineArn, 'Order workflow');
    output('TableName', table.tableName, 'DynamoDB table');
    output('SearchEndpoint', search.endpoint, 'OpenSearch domain endpoint');
    output('WebBucketName', web.bucket.bucketName, 'S3 bucket holding the web app');
  }
}
