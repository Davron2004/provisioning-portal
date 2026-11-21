import { resolve } from 'node:path';

/** The local harness's demo operator (services/api/src/local/demo-users.ts). */
export const DEMO_USER = {
  email: 'admin@example.com',
  password: 'portal-demo',
  name: 'Avery Clarke',
} as const;

/** Where the app keeps its session (AuthService, SESSION_STORAGE_KEY). */
export const SESSION_STORAGE_KEY = 'pp.session';

/** Written by auth.setup.ts after signing in through the login form. */
export const SESSION_FILE = resolve(import.meta.dirname, '../playwright/.auth/session.json');
