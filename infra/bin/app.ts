import { App } from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { WEB_BUILD_DIR } from '../lib/paths';
import { PortalStack } from '../lib/portal-stack';

/**
 * cdk synth|deploy [-c stage=dev] [-c region=ca-central-1] [-c budgetEmail=...]
 *
 * The account comes from the caller's credentials at deploy time; synth needs
 * no credentials (no lookups). See docs/deployment.md.
 */
const app = new App();
const context = (key: string) => app.node.tryGetContext(key) as unknown;
const config = loadConfig(context);
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region };

new PortalStack(app, `ProvisioningPortal-${config.stage}`, {
  env,
  config,
  webBuildDir: WEB_BUILD_DIR,
  description: `Provisioning portal (${config.stage}): web app, REST and WebSocket APIs, order workflow, search`,
  terminationProtection: config.isProduction,
});

// Deployed once by hand; the deploy workflow then uses its role.
new GithubOidcStack(app, 'ProvisioningPortal-GithubOidc', {
  env,
  description: 'GitHub Actions OIDC provider and deploy role for the provisioning portal',
  repository: String(context('githubRepository')),
  environment: String(context('githubEnvironment')),
  existingProviderArn: context('githubOidcProviderArn') as string | undefined,
});
