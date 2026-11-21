import { CfnOutput, Duration, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import {
  type IOidcProvider,
  OidcProviderNative,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { PROJECT } from './config';

const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

export interface GithubOidcStackProps extends StackProps {
  /** `owner/name` of the only repository allowed to assume the role. */
  repository: string;
  /** GitHub environment the deploy job runs in; it only allows the main branch. */
  environment: string;
  /** An existing GitHub OIDC provider in the account (there can be only one per URL). */
  existingProviderArn?: string;
  /** CDK bootstrap qualifier (`cdk bootstrap --qualifier`). */
  bootstrapQualifier?: string;
}

/**
 * Deployed once, by hand, with administrator credentials: the GitHub Actions
 * OIDC provider and the role the deploy workflow assumes. No long-lived keys.
 *
 * Trust: only tokens for `repo:<repository>:environment:<environment>` (a job
 * that declares that environment; the environment's branch policy only allows
 * `main`) with audience `sts.amazonaws.com`.
 *
 * Permissions: only assuming the CDK bootstrap roles of this account and
 * region. Those roles do the deploying (CloudFormation runs as the
 * bootstrap's execution role), so this role cannot touch resources directly.
 */
export class GithubOidcStack extends Stack {
  readonly role: Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);
    Tags.of(this).add('project', PROJECT);
    if (!/^[\w.-]+\/[\w.-]+$/.test(props.repository)) {
      throw new Error(`repository must be owner/name, got "${props.repository}"`);
    }

    const provider: IOidcProvider = props.existingProviderArn
      ? OidcProviderNative.fromOidcProviderArn(this, 'GithubProvider', props.existingProviderArn)
      : new OidcProviderNative(this, 'GithubProvider', {
          url: GITHUB_OIDC_URL,
          clientIds: ['sts.amazonaws.com'],
        });

    this.role = new Role(this, 'DeployRole', {
      roleName: `${PROJECT}-github-deploy`,
      description: `GitHub Actions deploys of ${props.repository} (environment ${props.environment})`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: `repo:${props.repository}:environment:${props.environment}`,
        },
      }),
    });

    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';
    this.role.addToPolicy(
      new PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${this.partition}:iam::${this.account}:role/cdk-${qualifier}-*-${this.account}-${this.region}`,
        ],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.role.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN repository variable',
    });
  }
}
