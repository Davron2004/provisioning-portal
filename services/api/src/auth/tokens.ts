import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { SignJWT, jwtVerify } from 'jose';
import { optionalEnv, requireEnv } from '../config/env';
import { UnauthorizedError } from '../errors';
import { actorFromClaims, type Actor } from './actor';

/**
 * Token verification for the two auth modes:
 *  - `cognito`: Cognito ID tokens, verified against the user pool's JWKS.
 *    Used by the WebSocket authorizer (REST uses the API Gateway Cognito
 *    authorizer, so the REST Lambda only reads claims).
 *  - `local`: HS256 tokens issued by the local harness for seeded demo users.
 *    The secret is a development default and only ever used locally.
 */
export interface TokenVerifier {
  verify(token: string): Promise<{ actor: Actor; claims: Record<string, unknown> }>;
}

export const LOCAL_TOKEN_ISSUER = 'provisioning-portal-local';
export const LOCAL_TOKEN_AUDIENCE = 'provisioning-portal';
const DEFAULT_LOCAL_SECRET = 'local-development-only-secret-change-me';
const LOCAL_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export type AuthMode = 'cognito' | 'local';

export function authMode(): AuthMode {
  const mode = process.env.AUTH_MODE ?? 'cognito';
  if (mode !== 'cognito' && mode !== 'local') throw new Error(`Unknown AUTH_MODE ${mode}`);
  return mode;
}

function localSecret(): Uint8Array {
  return new TextEncoder().encode(optionalEnv('LOCAL_JWT_SECRET') ?? DEFAULT_LOCAL_SECRET);
}

export async function issueLocalToken(
  user: { id: string; email: string; name: string },
  now = new Date(),
): Promise<{ idToken: string; expiresAt: string }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + LOCAL_TOKEN_TTL_SECONDS;
  const idToken = await new SignJWT({ email: user.email, name: user.name, token_use: 'id' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(LOCAL_TOKEN_ISSUER)
    .setAudience(LOCAL_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(localSecret());
  return { idToken, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export function createLocalVerifier(): TokenVerifier {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, localSecret(), {
          issuer: LOCAL_TOKEN_ISSUER,
          audience: LOCAL_TOKEN_AUDIENCE,
          algorithms: ['HS256'],
        });
        const claims = payload as Record<string, unknown>;
        return { actor: actorFromClaims(claims), claims };
      } catch (error) {
        if (error instanceof UnauthorizedError) throw error;
        throw new UnauthorizedError('The token is invalid or has expired');
      }
    },
  };
}

export function createCognitoVerifier(userPoolId: string, clientId: string): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'id' });
  return {
    async verify(token) {
      try {
        const payload = await verifier.verify(token);
        const claims = payload as unknown as Record<string, unknown>;
        return { actor: actorFromClaims(claims), claims };
      } catch (error) {
        if (error instanceof UnauthorizedError) throw error;
        throw new UnauthorizedError('The token is invalid or has expired');
      }
    },
  };
}

/** The verifier for the configured AUTH_MODE. */
export function createTokenVerifier(): TokenVerifier {
  return authMode() === 'local'
    ? createLocalVerifier()
    : createCognitoVerifier(requireEnv('COGNITO_USER_POOL_ID'), requireEnv('COGNITO_CLIENT_ID'));
}
