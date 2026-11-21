/**
 * Portal operators for local development (AUTH_MODE=local). These stand in
 * for the Cognito user pool and only exist in the local harness. The password
 * is shared and documented on purpose: it protects nothing.
 */
export const DEMO_PASSWORD = 'portal-demo';

export const DEMO_USERS = [
  { id: 'local-admin', email: 'admin@example.com', name: 'Avery Clarke' },
  { id: 'local-ops', email: 'ops@example.com', name: 'Jordan Mercier' },
] as const;

export function findDemoUser(email: string, password: string) {
  if (password !== DEMO_PASSWORD) return undefined;
  return DEMO_USERS.find((u) => u.email === email.trim().toLowerCase());
}
