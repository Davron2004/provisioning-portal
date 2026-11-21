/**
 * Harness configuration. Ports default to CLAUDE.md's table and can be moved
 * per worktree (API_PORT, WS_PORT, DDB_PORT, OPENSEARCH_PORT, WEB_PORT).
 */
export interface LocalConfig {
  apiPort: number;
  wsPort: number;
  host: string;
  tableName: string;
  dynamoEndpoint: string;
  openSearchEndpoint: string;
  allowedOrigins: string[];
  region: string;
}

const port = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a port number`);
  return value;
};

export function loadLocalConfig(): LocalConfig {
  const webPort = port('WEB_PORT', 4200);
  return {
    apiPort: port('API_PORT', 3000),
    wsPort: port('WS_PORT', 3001),
    host: process.env.HOST ?? 'localhost',
    tableName: process.env.TABLE_NAME ?? 'provisioning-local',
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT ?? `http://localhost:${port('DDB_PORT', 8000)}`,
    openSearchEndpoint:
      process.env.OPENSEARCH_ENDPOINT ?? `http://localhost:${port('OPENSEARCH_PORT', 9200)}`,
    allowedOrigins: (
      process.env.CORS_ALLOWED_ORIGINS ?? `http://localhost:${webPort},http://127.0.0.1:${webPort}`
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    region: process.env.AWS_REGION ?? 'ca-central-1',
  };
}

/**
 * Sets the environment the real handlers read, pointing every AWS client at
 * the local stand-ins. DynamoDB Local accepts any credentials, so dummy ones
 * are filled in when none are configured.
 */
export function applyHandlerEnvironment(config: LocalConfig, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {
    TABLE_NAME: config.tableName,
    DYNAMODB_ENDPOINT: config.dynamoEndpoint,
    OPENSEARCH_ENDPOINT: config.openSearchEndpoint,
    AUTH_MODE: 'local',
    AWS_REGION: config.region,
    CORS_ALLOWED_ORIGINS: config.allowedOrigins.join(','),
    ...extra,
  };
  Object.assign(process.env, env);
  process.env.AWS_ACCESS_KEY_ID ??= 'local';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
}
