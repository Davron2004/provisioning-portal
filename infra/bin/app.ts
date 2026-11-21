import { App } from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { WEB_BUILD_DIR } from '../lib/paths';
import { PortalStack } from '../lib/portal-stack';

/**
 * cdk synth|deploy [-c stage=dev] [-c region=ca-central-1] [-c budgetEmail=...]
 *
 * The account comes from the caller's credentials at deploy time; synth needs
 * no credentials (no lookups).
 */
const app = new App();
const config = loadConfig((key) => app.node.tryGetContext(key));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region };

new PortalStack(app, `ProvisioningPortal-${config.stage}`, {
  env,
  config,
  webBuildDir: WEB_BUILD_DIR,
  description: `Provisioning portal (${config.stage}): web app, REST and WebSocket APIs, order workflow, search`,
  terminationProtection: config.isProduction,
});
