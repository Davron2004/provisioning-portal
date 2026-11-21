import { Duration, type RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  DefinitionBody,
  LogLevel,
  StateMachine,
  StateMachineType,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { orderWorkflowDefinition } from '@provisioning/api/infra';
import { PortalFunction } from './portal-function';

export interface WorkflowProps {
  stage: string;
  table: ITableV2;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/**
 * The order workflow: a Standard state machine whose definition comes from
 * `orderWorkflowDefinition()` (the same shape the local runner executes), and
 * its three task Lambdas.
 */
export class Workflow extends Construct {
  readonly stateMachine: StateMachine;
  readonly validateOrder: PortalFunction<'validateOrder'>;
  readonly provisionLine: PortalFunction<'provisionLine'>;
  readonly finalizeOrder: PortalFunction<'finalizeOrder'>;

  constructor(scope: Construct, id: string, props: WorkflowProps) {
    super(scope, id);
    const common = {
      logRetention: props.logRetention,
      removalPolicy: props.removalPolicy,
      environment: { TABLE_NAME: props.table.tableName },
    };

    this.validateOrder = new PortalFunction(this, 'ValidateOrder', {
      ...common,
      handler: 'validateOrder',
      memorySize: 512,
      timeout: Duration.seconds(60),
    });
    // Runs the simulated provisioner: 1-3 s per step, a handful of steps per line.
    this.provisionLine = new PortalFunction(this, 'ProvisionLine', {
      ...common,
      handler: 'provisionLine',
      timeout: Duration.seconds(90),
    });
    this.finalizeOrder = new PortalFunction(this, 'FinalizeOrder', {
      ...common,
      handler: 'finalizeOrder',
      timeout: Duration.seconds(30),
    });

    const tasks = [this.validateOrder, this.provisionLine, this.finalizeOrder];
    const definition = orderWorkflowDefinition({
      validateOrder: this.validateOrder.functionArn,
      provisionLine: this.provisionLine.functionArn,
      finalizeOrder: this.finalizeOrder.functionArn,
    });

    this.stateMachine = new StateMachine(this, 'OrderWorkflow', {
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromString(Stack.of(this).toJsonString(definition)),
      timeout: Duration.minutes(30),
      tracingEnabled: true,
      logs: {
        destination: new LogGroup(this, 'Logs', {
          // The vendedlogs prefix keeps CloudWatch's resource policy small.
          logGroupName: `/aws/vendedlogs/states/provisioning-portal-${props.stage}-orders`,
          retention: props.logRetention,
          removalPolicy: props.removalPolicy,
        }),
        level: LogLevel.ERROR,
        includeExecutionData: true,
      },
    });
    // The ASL is built outside CDK's task constructs, so invoke rights are explicit.
    for (const fn of tasks) fn.grantInvoke(this.stateMachine);
  }
}
