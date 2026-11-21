import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../errors';
import { actorFromClaims } from './actor';
import {
  createLocalVerifier,
  issueLocalToken,
  LOCAL_TOKEN_AUDIENCE,
  LOCAL_TOKEN_ISSUER,
} from './tokens';

const user = { id: 'local-admin', email: 'admin@example.com', name: 'Avery Clarke' };

describe('local tokens', () => {
  const verifier = createLocalVerifier();

  it('issues tokens the local verifier accepts', async () => {
    const { idToken, expiresAt } = await issueLocalToken(user);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    const { actor, claims } = await verifier.verify(idToken);
    expect(actor).toEqual(user);
    expect(claims.token_use).toBe('id');
  });

  it('rejects expired, tampered and foreign tokens', async () => {
    const expired = await issueLocalToken(user, new Date(Date.now() - 24 * 3600_000));
    await expect(verifier.verify(expired.idToken)).rejects.toThrow(UnauthorizedError);

    const { idToken } = await issueLocalToken(user);
    const [h, p, s] = idToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(p!, 'base64url').toString()),
        email: 'x@example.com',
      }),
    ).toString('base64url');
    await expect(verifier.verify(`${h}.${forgedPayload}.${s}`)).rejects.toThrow(UnauthorizedError);

    const otherKey = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(LOCAL_TOKEN_ISSUER)
      .setAudience(LOCAL_TOKEN_AUDIENCE)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('some-other-secret'));
    await expect(verifier.verify(otherKey)).rejects.toThrow(UnauthorizedError);
  });
});

describe('actorFromClaims', () => {
  it('falls back to the email when there is no name claim', () => {
    expect(actorFromClaims({ sub: 's', email: 'a@example.com' })).toEqual({
      id: 's',
      email: 'a@example.com',
      name: 'a@example.com',
    });
  });

  it('requires sub and email', () => {
    expect(() => actorFromClaims({ sub: 's' })).toThrow(UnauthorizedError);
    expect(() => actorFromClaims(undefined)).toThrow(UnauthorizedError);
  });
});
