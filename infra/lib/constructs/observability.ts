import { Annotations, Duration } from 'aws-cdk-lib';
import type { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import {
  Alarm,
  ComparisonOperator,
  type IMetric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { Domain } from 'aws-cdk-lib/aws-opensearchservice';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import type { IStateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface ObservabilityProps {
  stage: string;
  /** Budget and alarm notifications. Without it there is no budget and alarms have no action. */
  email?: string;
  monthlyBudgetUsd: number;
  functions: { id: string; fn: IFunction }[];
  stateMachine: IStateMachine;
  deadLetterQueues: { id: string; queue: IQueue }[];
  restApi: RestApi;
  searchDomain: Domain;
}

/**
 * Cost guardrails and the alarms worth waking up for: a monthly AWS Budget,
 * and alarms on Lambda errors, failed workflow executions, stream DLQ depth,
 * API 5xx responses and search domain health. About $0.10 per alarm per month.
 */
export class Observability extends Construct {
  readonly topic?: Topic;

  constructor(scope: Construct, id: string, props: ObservabilityProps) {
    super(scope, id);

    if (props.email) {
      this.topic = new Topic(this, 'Alarms', {
        displayName: `Provisioning portal (${props.stage}) alarms`,
        enforceSSL: true,
      });
      this.topic.addSubscription(new EmailSubscription(props.email));
      this.budget(props.stage, props.monthlyBudgetUsd, props.email);
    } else {
      Annotations.of(this).addWarningV2(
        'provisioning:no-budget-email',
        'No budgetEmail in context (-c budgetEmail=you@example.com or BUDGET_EMAIL): ' +
          'the monthly AWS Budget is skipped and alarms have no notification target.',
      );
    }

    for (const { id: name, fn } of props.functions) {
      this.alarm(`${name}Errors`, fn.metricErrors({ period: Duration.minutes(5) }), {
        description: `${name} Lambda threw errors`,
      });
    }
    this.alarm('WorkflowFailed', props.stateMachine.metricFailed({ period: Duration.minutes(5) }), {
      description: 'An order workflow execution failed (not a failed order: the workflow itself)',
    });
    for (const { id: name, queue } of props.deadLetterQueues) {
      this.alarm(
        `${name}Depth`,
        queue.metricApproximateNumberOfMessagesVisible({
          period: Duration.minutes(5),
          statistic: 'Maximum',
        }),
        { description: `${name}: stream records were dropped after retries` },
      );
    }
    this.alarm('Api5xx', props.restApi.metricServerError({ period: Duration.minutes(5) }), {
      description: 'REST API returned 5xx responses',
      threshold: 5,
    });
    this.alarm(
      'SearchClusterRed',
      props.searchDomain.metricClusterStatusRed({ period: Duration.minutes(5) }),
      { description: 'Search domain cluster status is red' },
    );
    this.alarm(
      'SearchStorageLow',
      props.searchDomain.metricFreeStorageSpace({
        period: Duration.minutes(5),
        statistic: 'Minimum',
      }),
      {
        description: 'Search domain has less than 2 GiB free storage',
        threshold: 2048,
        comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      },
    );
  }

  private alarm(
    id: string,
    metric: IMetric,
    options: { description: string; threshold?: number; comparisonOperator?: ComparisonOperator },
  ): Alarm {
    const alarm = new Alarm(this, id, {
      metric,
      alarmDescription: options.description,
      threshold: options.threshold ?? 1,
      evaluationPeriods: 1,
      comparisonOperator:
        options.comparisonOperator ?? ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    if (this.topic) alarm.addAlarmAction(new SnsAction(this.topic));
    return alarm;
  }

  private budget(stage: string, amount: number, email: string): void {
    const subscribers = [{ subscriptionType: 'EMAIL', address: email }];
    new CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `provisioning-portal-${stage}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
      ],
    });
  }
}
