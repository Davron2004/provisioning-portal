import { join } from 'node:path';
import { Duration, type RemovalPolicy } from 'aws-cdk-lib';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { LogLevel, NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, type RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { HANDLERS } from '@provisioning/api/infra';
import { API_ROOT, REPO_ROOT } from '../paths';

export type HandlerName = keyof typeof HANDLERS;
/** The environment variables a handler declares in `@provisioning/api/infra`. */
export type HandlerEnv<N extends HandlerName> = (typeof HANDLERS)[N]['env'][number];

export interface PortalFunctionProps<N extends HandlerName> {
  handler: N;
  /** Only variables the handler declares are accepted; see `setEnv` for values known later. */
  environment: Partial<Record<HandlerEnv<N>, string>>;
  memorySize?: number;
  timeout?: Duration;
  description?: string;
  logRetention: RetentionDays;
  removalPolicy: RemovalPolicy;
}

/**
 * ESM shim: some bundled dependencies are CommonJS and call `require` for Node
 * built-ins, which does not exist in an ES module.
 */
const REQUIRE_SHIM =
  "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";

/**
 * One of the API's Lambda handlers, bundled from source with esbuild (no
 * Docker): Node.js 22 on ARM64, ESM, minified with source maps, its own log
 * group, X-Ray tracing. Environment variable names are checked against the
 * handler's declaration at compile time.
 */
export class PortalFunction<N extends HandlerName> extends NodejsFunction {
  readonly handlerName: N;

  constructor(scope: Construct, id: string, props: PortalFunctionProps<N>) {
    const spec = HANDLERS[props.handler];
    const logGroup = new LogGroup(scope, `${id}Logs`, {
      retention: props.logRetention,
      removalPolicy: props.removalPolicy,
    });
    super(scope, id, {
      entry: join(API_ROOT, spec.entry),
      handler: 'handler',
      description: props.description ?? spec.trigger,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? Duration.seconds(10),
      tracing: Tracing.ACTIVE,
      logGroup,
      environment: {
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--enable-source-maps',
        ...definedValues(props.environment),
      },
      projectRoot: REPO_ROOT,
      depsLockFilePath: join(REPO_ROOT, 'package-lock.json'),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        mainFields: ['module', 'main'],
        banner: REQUIRE_SHIM,
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        // Bundle the AWS SDK too: the version is pinned by the lockfile instead
        // of whatever the runtime ships, and unused clients are tree-shaken.
        externalModules: [],
        tsconfig: join(API_ROOT, 'tsconfig.json'),
        logLevel: LogLevel.WARNING,
      },
    });
    this.handlerName = props.handler;
  }

  /** Sets a declared environment variable whose value is only known after construction. */
  setEnv(name: HandlerEnv<N>, value: string): this {
    this.addEnvironment(name, value);
    return this;
  }
}

function definedValues(record: Partial<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
