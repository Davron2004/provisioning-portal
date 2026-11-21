import { RemovalPolicy } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config';

const load = (context: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) =>
  loadConfig((key) => context[key], env);

describe('loadConfig', () => {
  it('defaults to a dev stage in ca-central-1 with Bedrock and a $50 budget', () => {
    const config = load({});
    expect(config).toMatchObject({
      stage: 'dev',
      region: 'ca-central-1',
      isProduction: false,
      removalPolicy: RemovalPolicy.DESTROY,
      monthlyBudgetUsd: 50,
      budgetEmail: undefined,
      assistant: {
        provider: 'bedrock',
        model: 'anthropic.claude-opus-5-5',
        bedrockRegion: 'ca-central-1',
        anthropicApiKeyParam: '/provisioning-portal/dev/anthropic-api-key',
      },
    });
  });

  it('retains data and skips demo data in prod', () => {
    const prod = load({ stage: 'prod' });
    expect(prod.removalPolicy).toBe(RemovalPolicy.RETAIN);
    expect(prod.seedDemoData).toBe(false);
    expect(load({}).seedDemoData).toBe(true);
    expect(load({ seedDemoData: 'false' }).seedDemoData).toBe(false);
  });

  it('takes the budget email from context or BUDGET_EMAIL, and validates it', () => {
    expect(load({ budgetEmail: 'a@example.com' }).budgetEmail).toBe('a@example.com');
    expect(load({}, { BUDGET_EMAIL: 'b@example.com' }).budgetEmail).toBe('b@example.com');
    expect(load({}, { BUDGET_EMAIL: '' }).budgetEmail).toBeUndefined();
    expect(() => load({ budgetEmail: 'not-an-email' })).toThrow(/budgetEmail/);
  });

  it('rejects stage names that would break resource names', () => {
    expect(() => load({ stage: 'Dev_1' })).toThrow(/stage/);
  });

  it('uses no model for the rules provider and rejects unknown providers', () => {
    expect(load({ assistantProvider: 'rules' }).assistant.model).toBeUndefined();
    expect(() => load({ assistantProvider: 'openai' })).toThrow(/assistantProvider/);
  });
});
