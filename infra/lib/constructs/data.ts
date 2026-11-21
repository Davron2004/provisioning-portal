import type { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, Billing, StreamViewType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { TABLE_DEFINITION } from '@provisioning/api/infra';

export interface DataProps {
  removalPolicy: RemovalPolicy;
  deletionProtection: boolean;
}

/**
 * The single DynamoDB table, built from TABLE_DEFINITION so the keys, indexes,
 * TTL and stream match what the API code and the local harness use.
 */
export class Data extends Construct {
  readonly table: TableV2;

  constructor(scope: Construct, id: string, props: DataProps) {
    super(scope, id);
    const def = TABLE_DEFINITION;
    const key = (name: string) => ({ name, type: AttributeType.STRING });

    this.table = new TableV2(this, 'Table', {
      partitionKey: key(def.partitionKey),
      sortKey: key(def.sortKey),
      globalSecondaryIndexes: def.globalSecondaryIndexes.map((gsi) => ({
        indexName: gsi.indexName,
        partitionKey: key(gsi.partitionKey),
        sortKey: key(gsi.sortKey),
      })),
      billing: Billing.onDemand(),
      timeToLiveAttribute: def.timeToLiveAttribute,
      dynamoStream: StreamViewType[def.streamViewType],
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: props.deletionProtection,
      removalPolicy: props.removalPolicy,
    });
  }
}
