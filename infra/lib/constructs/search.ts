import { Lazy, type RemovalPolicy, Stack } from 'aws-cdk-lib';
import { EbsDeviceVolumeType } from 'aws-cdk-lib/aws-ec2';
import { Effect, type IRole, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  type CfnDomain,
  Domain,
  EngineVersion,
  TLSSecurityPolicy,
} from 'aws-cdk-lib/aws-opensearchservice';
import { Construct } from 'constructs';

export interface SearchProps {
  stage: string;
  removalPolicy: RemovalPolicy;
}

/** The one search index (OPENSEARCH_INDEX); both grants are scoped to it. */
export const SEARCH_INDEX = 'provisioning';

const READ_ACTIONS = ['es:ESHttpGet', 'es:ESHttpHead', 'es:ESHttpPost'];
const WRITE_ACTIONS = [...READ_ACTIONS, 'es:ESHttpPut', 'es:ESHttpDelete'];

/**
 * OpenSearch Service domain for the global search box: the smallest
 * production-shaped setup (one t3.small.search node, 10 GiB gp3, no dedicated
 * masters, no standby). Encrypted at rest and in transit, HTTPS with TLS 1.2+.
 *
 * It has a public endpoint instead of living in a VPC: a VPC domain would need
 * the Lambdas in the VPC too, plus NAT or VPC endpoints for DynamoDB, Step
 * Functions, Bedrock and API Gateway, which costs more than the domain itself.
 * Access is controlled by IAM instead: every request is SigV4-signed, and the
 * domain's resource policy only admits the roles granted here.
 */
export class Search extends Construct {
  readonly domain: Domain;
  readonly endpoint: string;
  private readonly principals: IRole[] = [];

  constructor(scope: Construct, id: string, props: SearchProps) {
    super(scope, id);
    // A fixed name lets the resource policy name the domain's ARN without
    // referring to the domain itself.
    const domainName = `provisioning-${props.stage}`;
    const domainArn = Stack.of(this).formatArn({
      service: 'es',
      resource: 'domain',
      resourceName: domainName,
    });

    this.domain = new Domain(this, 'Domain', {
      domainName,
      version: EngineVersion.OPENSEARCH_2_19,
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: 't3.small.search',
        multiAzWithStandbyEnabled: false,
      },
      zoneAwareness: { enabled: false },
      ebs: { volumeSize: 10, volumeType: EbsDeviceVolumeType.GP3 },
      enforceHttps: true,
      tlsSecurityPolicy: TLSSecurityPolicy.TLS_1_2_PFS,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      removalPolicy: props.removalPolicy,
    });

    // Set on the L1 resource: the L2 `accessPolicies` prop applies the policy
    // through an extra custom-resource Lambda after the domain is created.
    (this.domain.node.defaultChild as CfnDomain).accessPolicies = Lazy.any({
      produce: () =>
        new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              principals: [...this.principals],
              actions: WRITE_ACTIONS,
              resources: [`${domainArn}/*`],
            }),
          ],
        }).toJSON(),
    });
    this.node.addValidation({
      validate: () =>
        this.principals.length === 0 ? ['No role was granted access to the search domain'] : [],
    });

    this.endpoint = `https://${this.domain.domainEndpoint}`;
  }

  /** Search queries (http Lambda). */
  grantRead(role: IRole): void {
    this.grant(role, READ_ACTIONS);
  }

  /** Index creation and bulk writes (search-indexer). */
  grantReadWrite(role: IRole): void {
    this.grant(role, WRITE_ACTIONS);
  }

  private grant(role: IRole, actions: string[]): void {
    this.principals.push(role);
    role.addToPrincipalPolicy(
      new PolicyStatement({
        actions,
        resources: [
          `${this.domain.domainArn}/${SEARCH_INDEX}`,
          `${this.domain.domainArn}/${SEARCH_INDEX}/*`,
        ],
      }),
    );
  }
}
