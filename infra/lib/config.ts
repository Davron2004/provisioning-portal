import { RemovalPolicy } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ASSISTANT_DEFAULT_MODELS } from '@provisioning/api/infra';

export const PROJECT = 'provisioning-portal';

export type AssistantProvider = 'bedrock' | 'anthropic' | 'rules';

/** Everything that differs between deployments, resolved once from CDK context. */
export interface PortalConfig {
  /** Short lowercase name used in resource names and tags (`dev`, `prod`). */
  stage: string;
  region: string;
  /** Production keeps data (table, user pool, search domain, web bucket) when the stack is deleted. */
  isProduction: boolean;
  removalPolicy: RemovalPolicy;
  logRetention: RetentionDays;
  /** Where budget and alarm notifications go. Never committed: pass `-c budgetEmail=...`. */
  budgetEmail?: string;
  monthlyBudgetUsd: number;
  assistant: {
    provider: AssistantProvider;
    model?: string;
    /** Region for Bedrock calls; defaults to the stack region. */
    bedrockRegion: string;
    /** SSM SecureString holding the Claude API key, used when provider is `anthropic`. */
    anthropicApiKeyParam: string;
  };
  /** Seed the demo dataset into the empty table on first deploy (default: every stage but prod). */
  seedDemoData: boolean;
  /** Stage-level REST API throttling (requests per second, burst). Protects Lambda and Bedrock spend. */
  apiThrottle: { rateLimit: number; burstLimit: number };
}

type ContextReader = (key: string) => unknown;

const STAGE_PATTERN = /^[a-z][a-z0-9-]{1,11}$/;
const PROVIDERS: readonly AssistantProvider[] = ['bedrock', 'anthropic', 'rules'];

/**
 * Reads deployment settings from CDK context (`-c key=value` or cdk.json),
 * falling back to environment variables for the values CI passes in.
 */
export function loadConfig(
  context: ContextReader,
  env: NodeJS.ProcessEnv = process.env,
): PortalConfig {
  const read = (key: string, envName?: string): string | undefined => {
    const value = context(key) ?? (envName ? env[envName] : undefined);
    if (value === undefined || value === null || value === '') return undefined;
    return String(value);
  };

  const stage = read('stage') ?? 'dev';
  if (!STAGE_PATTERN.test(stage)) {
    throw new Error(`stage "${stage}" must be 2-12 lowercase letters, digits or dashes`);
  }
  const region = read('region') ?? 'ca-central-1';
  const isProduction = stage === 'prod';

  const provider = (read('assistantProvider') ?? 'bedrock') as AssistantProvider;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`assistantProvider must be one of ${PROVIDERS.join(', ')}`);
  }
  const defaultModel =
    provider === 'rules'
      ? undefined
      : ASSISTANT_DEFAULT_MODELS[provider as 'bedrock' | 'anthropic'];

  const budgetEmail = read('budgetEmail', 'BUDGET_EMAIL');
  if (budgetEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(budgetEmail)) {
    throw new Error('budgetEmail is not an email address');
  }

  return {
    stage,
    region,
    isProduction,
    removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    logRetention: isProduction ? RetentionDays.THREE_MONTHS : RetentionDays.TWO_WEEKS,
    budgetEmail,
    monthlyBudgetUsd: positiveNumber(read('monthlyBudgetUsd') ?? '50', 'monthlyBudgetUsd'),
    assistant: {
      provider,
      model: read('assistantModel') ?? defaultModel,
      bedrockRegion: read('bedrockRegion') ?? region,
      anthropicApiKeyParam:
        read('anthropicApiKeyParam') ?? `/${PROJECT}/${stage}/anthropic-api-key`,
    },
    seedDemoData: (read('seedDemoData') ?? String(!isProduction)) === 'true',
    apiThrottle: {
      rateLimit: positiveNumber(read('apiRateLimit') ?? '10', 'apiRateLimit'),
      burstLimit: positiveNumber(read('apiBurstLimit') ?? '20', 'apiBurstLimit'),
    },
  };
}

function positiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}
