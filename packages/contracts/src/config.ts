import { z } from 'zod';

/**
 * Runtime configuration the web app fetches from /config.json at startup.
 * Locally it is served by the dev harness; in AWS it is written by CDK next to the app.
 */
export const RuntimeConfig = z.object({
  apiBaseUrl: z.url(),
  websocketUrl: z.url(),
  auth: z.discriminatedUnion('mode', [
    /** Local development: the harness issues tokens for seeded demo users. */
    z.object({ mode: z.literal('local'), loginUrl: z.url() }),
    z.object({
      mode: z.literal('cognito'),
      region: z.string(),
      userPoolId: z.string(),
      userPoolClientId: z.string(),
    }),
  ]),
  environment: z.enum(['local', 'aws']),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;

/** Local harness login: POST loginUrl with LocalLoginRequest -> LocalLoginResponse. */
export const LocalLoginRequest = z.object({ email: z.email(), password: z.string().min(1) });
export type LocalLoginRequest = z.infer<typeof LocalLoginRequest>;

export const LocalLoginResponse = z.object({
  idToken: z.string(),
  expiresAt: z.iso.datetime(),
  user: z.object({ email: z.email(), name: z.string() }),
});
export type LocalLoginResponse = z.infer<typeof LocalLoginResponse>;
