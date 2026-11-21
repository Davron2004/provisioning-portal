import { CustomResource, Duration, type RemovalPolicy } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { PortalFunction } from './portal-function';

export interface DemoDataProps {
  table: ITableV2;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/**
 * Seeds the demo dataset (fictional accounts, sites, users, numbers, order
 * history) into an empty table when the stack is first created, so a fresh
 * non-production deployment is usable straight away. Never in production.
 */
export class DemoData extends Construct {
  readonly handler: PortalFunction<'seedDemoData'>;

  constructor(scope: Construct, id: string, props: DemoDataProps) {
    super(scope, id);
    this.handler = new PortalFunction(this, 'Handler', {
      handler: 'seedDemoData',
      memorySize: 512,
      timeout: Duration.minutes(5),
      logRetention: props.logRetention,
      removalPolicy: props.removalPolicy,
      environment: { TABLE_NAME: props.table.tableName },
    });
    const provider = new Provider(this, 'Provider', {
      onEventHandler: this.handler,
      logGroup: new LogGroup(this, 'ProviderLogs', {
        retention: props.logRetention,
        removalPolicy: props.removalPolicy,
      }),
    });
    new CustomResource(this, 'Seed', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::DemoData',
    });
  }
}
