import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against DynamoDB Local (and OpenSearch where needed):
 *   docker compose up -d && npm run test:integration -w @provisioning/api
 * DYNAMODB_ENDPOINT / OPENSEARCH_ENDPOINT override the default ports.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    env: { LOG_LEVEL: 'silent' },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
