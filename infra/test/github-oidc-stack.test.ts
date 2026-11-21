import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { ACCOUNT, flattenJoin, REGION } from './helpers';

const REPO = 'Davron2004/provisioning-portal';

function synth(props: { existingProviderArn?: string } = {}) {
  const stack = new GithubOidcStack(new App(), 'Oidc', {
    env: { account: ACCOUNT, region: REGION },
    repository: REPO,
    environment: 'aws-dev',
    ...props,
  });
  return Template.fromStack(stack);
}

describe('GithubOidcStack', () => {
  it('registers the GitHub Actions OIDC provider for STS', () => {
    synth().hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it('trusts only this repository’s aws-dev environment, with exact matches', () => {
    const roles = synth().findResources('AWS::IAM::Role');
    const [role] = Object.values(roles);
    const statements = role!.Properties.AssumeRolePolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      Action: 'sts:AssumeRoleWithWebIdentity',
      Effect: 'Allow',
      Principal: { Federated: { Ref: expect.stringMatching(/^GithubProvider/) } },
      Condition: {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${REPO}:environment:aws-dev`,
        },
      },
    });
    // No StringLike: wildcards in `sub` are how other repos or branches get in.
    expect(statements[0].Condition.StringLike).toBeUndefined();
    expect(role!.Properties.MaxSessionDuration).toBe(3600);
  });

  it('may only assume the CDK bootstrap roles of its account and region', () => {
    const template = synth();
    template.resourceCountIs('AWS::IAM::Policy', 1);
    const [policy] = Object.values(template.findResources('AWS::IAM::Policy'));
    const statements = policy!.Properties.PolicyDocument.Statement;
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      Sid: 'AssumeCdkBootstrapRoles',
      Effect: 'Allow',
      Action: 'sts:AssumeRole',
    });
    expect(flattenJoin(statements[0].Resource)).toBe(
      `arn:<AWS::Partition>:iam::${ACCOUNT}:role/cdk-hnb659fds-*-${ACCOUNT}-${REGION}`,
    );
    const roles = template.findResources('AWS::IAM::Role');
    expect(Object.values(roles)[0]!.Properties.ManagedPolicyArns).toBeUndefined();
  });

  it('outputs the role ARN for the repository variable', () => {
    synth().hasOutput('DeployRoleArn', { Value: { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] } });
  });

  it('reuses an existing provider instead of creating a second one', () => {
    const arn = `arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com`;
    const template = synth({ existingProviderArn: arn });
    template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Federated: arn } })],
      },
    });
  });

  it('rejects a malformed repository name', () => {
    expect(
      () =>
        new GithubOidcStack(new App(), 'Bad', { repository: 'not a repo', environment: 'aws-dev' }),
    ).toThrow(/owner\/name/);
  });
});
