import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the full local stack: the API harness (the real Lambda handlers on
 * DynamoDB Local and OpenSearch) and the production build of the web app.
 * DynamoDB Local and OpenSearch must already be running (`docker compose up -d`
 * locally, service containers in CI). Ports follow the lane variables in CLAUDE.md.
 */
const ports = {
  DDB_PORT: process.env['DDB_PORT'] ?? '8000',
  OPENSEARCH_PORT: process.env['OPENSEARCH_PORT'] ?? '9200',
  API_PORT: process.env['API_PORT'] ?? '3000',
  WS_PORT: process.env['WS_PORT'] ?? '3001',
  WEB_PORT: process.env['WEB_PORT'] ?? '4200',
};
const isCI = !!process.env['CI'];
/** E2E_REUSE_SERVERS=1 reuses a harness and web server that are already up (the data is not reset). */
const reuseExistingServer = process.env['E2E_REUSE_SERVERS'] === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : 4,
  expect: { timeout: 10_000 },
  reporter: [[isCI ? 'github' : 'list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${ports.WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      name: 'api',
      // --reset drops the table and reseeds, so every run starts from the same data.
      command: 'npm run start:local -w @provisioning/api -- --reset',
      cwd: '..',
      url: `http://localhost:${ports.API_PORT}/config.json`,
      env: {
        ...ports,
        // Deterministic and quick: no random transient failures, short provisioning steps.
        PROVISIONING_TRANSIENT_FAILURE_RATE: '0',
        PROVISIONING_STEP_DELAY_MS: '150-400',
        ASSISTANT_PROVIDER: 'rules',
        // The +fail lines log expected warnings; keep the output to real errors.
        LOG_LEVEL: 'error',
      },
      timeout: 180_000,
      reuseExistingServer,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      name: 'web',
      command: 'npm run build -w @provisioning/web && node e2e/support/serve-web.ts',
      cwd: '..',
      url: `http://localhost:${ports.WEB_PORT}/config.json`,
      env: ports,
      timeout: 180_000,
      reuseExistingServer,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
