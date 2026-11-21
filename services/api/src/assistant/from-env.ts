import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AssistantProvider } from '@provisioning/contracts';
import { ClaudeIntentProvider } from './claude-provider';
import type { IntentProvider } from './provider';
import { RulesIntentProvider } from './rules-provider';

export const DEFAULT_MODELS = {
  bedrock: 'anthropic.claude-opus-5-5',
  anthropic: 'claude-opus-5-5',
} as const;

/**
 * Picks the provider from ASSISTANT_PROVIDER (default `rules`):
 *  - `bedrock`: Claude on Amazon Bedrock through the Mantle Messages API,
 *    SigV4 with the Lambda role (`bedrock-mantle:CreateInference`), region
 *    BEDROCK_REGION or AWS_REGION, model ASSISTANT_MODEL or
 *    anthropic.claude-opus-5-5;
 *  - `anthropic`: the Claude API, key from ANTHROPIC_API_KEY or the SSM
 *    SecureString named by ANTHROPIC_API_KEY_PARAM, model ASSISTANT_MODEL or
 *    claude-opus-5-5;
 *  - `rules`: the offline parser.
 */
export async function providerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntentProvider> {
  const name = AssistantProvider.parse(env.ASSISTANT_PROVIDER ?? 'rules');
  switch (name) {
    case 'rules':
      return new RulesIntentProvider();
    case 'bedrock': {
      const awsRegion = env.BEDROCK_REGION ?? env.AWS_REGION;
      if (!awsRegion)
        throw new Error('ASSISTANT_PROVIDER=bedrock needs BEDROCK_REGION or AWS_REGION');
      return new ClaudeIntentProvider(
        new AnthropicBedrockMantle({ awsRegion }),
        'bedrock',
        env.ASSISTANT_MODEL ?? DEFAULT_MODELS.bedrock,
      );
    }
    case 'anthropic': {
      const apiKey = env.ANTHROPIC_API_KEY ?? (await apiKeyFromSsm(env.ANTHROPIC_API_KEY_PARAM));
      return new ClaudeIntentProvider(
        new Anthropic({ apiKey }),
        'anthropic',
        env.ASSISTANT_MODEL ?? DEFAULT_MODELS.anthropic,
      );
    }
  }
}

async function apiKeyFromSsm(parameterName: string | undefined): Promise<string> {
  if (!parameterName) {
    throw new Error(
      'ASSISTANT_PROVIDER=anthropic needs ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_PARAM',
    );
  }
  const { Parameter } = await new SSMClient({}).send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  if (!Parameter?.Value) throw new Error(`SSM parameter ${parameterName} is empty`);
  return Parameter.Value;
}

let cached: Promise<IntentProvider> | undefined;
/** One provider per Lambda container; a failed setup is retried on the next request. */
export function sharedProvider(): Promise<IntentProvider> {
  cached ??= providerFromEnv().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
