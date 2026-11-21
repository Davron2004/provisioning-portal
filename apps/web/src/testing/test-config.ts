import { Provider } from '@angular/core';
import { RuntimeConfig } from '@provisioning/contracts';
import { AppConfig } from '../app/core/config/app-config';

export const LOCAL_CONFIG: RuntimeConfig = {
  apiBaseUrl: 'http://api.test',
  websocketUrl: 'ws://ws.test',
  auth: { mode: 'local', loginUrl: 'http://api.test/auth/login' },
  environment: 'local',
};

export const COGNITO_CONFIG: RuntimeConfig = {
  apiBaseUrl: 'https://api.example.com',
  websocketUrl: 'wss://ws.example.com',
  auth: {
    mode: 'cognito',
    region: 'ca-central-1',
    userPoolId: 'ca-central-1_TEST',
    userPoolClientId: 'client-123',
  },
  environment: 'aws',
};

/** Stands in for the loaded /config.json. */
export function provideTestConfig(config: RuntimeConfig = LOCAL_CONFIG): Provider {
  return { provide: AppConfig, useValue: { value: config } };
}

/** An unsigned JWT with the given claims, enough for code that only reads the payload. */
export function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`;
}
