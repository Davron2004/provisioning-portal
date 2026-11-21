import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { loadConfig } from '../lib/config';
import { PortalStack } from '../lib/portal-stack';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_WEB_DIR = join(here, 'fixtures', 'web');
export const ACCOUNT = '123456789012';
export const REGION = 'ca-central-1';

/** The feature flags from cdk.json, so tests synthesize what `cdk synth` does. */
const cdkJsonContext = (
  JSON.parse(readFileSync(join(here, '..', 'cdk.json'), 'utf8')) as {
    context: Record<string, unknown>;
  }
).context;

export interface SynthOptions {
  context?: Record<string, unknown>;
  /** Bundle the Lambda handlers with esbuild (slow); off by default. */
  bundle?: boolean;
  outdir?: string;
}

export function synthPortal(options: SynthOptions = {}) {
  const app = new App({
    outdir: options.outdir,
    context: {
      ...cdkJsonContext,
      ...options.context,
      // Metadata the CDK CLI adds: construct paths and asset locations.
      'aws:cdk:enable-path-metadata': true,
      'aws:cdk:enable-asset-metadata': true,
      // An empty list skips asset bundling for every stack.
      ...(options.bundle ? {} : { 'aws:cdk:bundling-stacks': [] }),
    },
  });
  const config = loadConfig((key) => app.node.tryGetContext(key), {});
  const stack = new PortalStack(app, 'Portal', {
    env: { account: ACCOUNT, region: REGION },
    config,
    webBuildDir: FIXTURE_WEB_DIR,
  });
  return { app, stack, config, template: Template.fromStack(stack) };
}

type Resources = Record<string, { Type: string; Properties?: Record<string, unknown> }>;

/** The single resource of a type, with its logical id. */
export function onlyResource(template: Template, type: string) {
  const entries = Object.entries(template.findResources(type) as Resources);
  if (entries.length !== 1) throw new Error(`expected one ${type}, found ${entries.length}`);
  const [logicalId, resource] = entries[0]!;
  return { logicalId, properties: resource.Properties ?? {} };
}

/**
 * Resolves an Fn::Join of literal strings and references into one string,
 * writing each reference as `<LogicalId>` (`Ref`) or `<LogicalId.Attr>`.
 */
export function flattenJoin(value: unknown): string {
  if (typeof value === 'string') return value;
  const join = (value as { 'Fn::Join'?: [string, unknown[]] })['Fn::Join'];
  if (join) return join[1].map(flattenJoin).join(join[0]);
  const ref = (value as { Ref?: string }).Ref;
  if (ref) return `<${ref}>`;
  const getAtt = (value as { 'Fn::GetAtt'?: [string, string] })['Fn::GetAtt'];
  if (getAtt) return `<${getAtt.join('.')}>`;
  throw new Error(`cannot flatten ${JSON.stringify(value)}`);
}

/** Logical id of the Lambda function whose code is under the given construct path. */
export function functionId(template: Template, constructPath: string): string {
  const matches = Object.entries(
    template.findResources('AWS::Lambda::Function') as Record<
      string,
      { Metadata?: { 'aws:cdk:path'?: string } }
    >,
  ).filter(([, r]) => r.Metadata?.['aws:cdk:path'] === `Portal/${constructPath}/Resource`);
  if (matches.length !== 1) throw new Error(`no single function at ${constructPath}`);
  return matches[0]![0];
}

export function roleIdOf(template: Template, fnLogicalId: string): string {
  const fn = template.toJSON().Resources[fnLogicalId] as {
    Properties: { Role: { 'Fn::GetAtt': [string, string] } };
  };
  return fn.Properties.Role['Fn::GetAtt'][0];
}

/** Every IAM statement attached to a role (all AWS::IAM::Policy resources naming it). */
export function statementsOf(template: Template, roleLogicalId: string) {
  const policies = Object.values(
    template.findResources('AWS::IAM::Policy') as Record<
      string,
      {
        Properties: {
          Roles: { Ref: string }[];
          PolicyDocument: { Statement: Record<string, unknown>[] };
        };
      }
    >,
  ).filter((p) => p.Properties.Roles.some((r) => r.Ref === roleLogicalId));
  return policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
}

export function actionsOf(statements: Record<string, unknown>[]): string[] {
  return statements.flatMap((s) => [s.Action].flat() as string[]);
}
