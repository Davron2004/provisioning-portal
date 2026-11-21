import type { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import { createTokenVerifier, type TokenVerifier } from '../auth/tokens';
import { logger } from '../logger';

/**
 * Lambda REQUEST authorizer for the WebSocket API's $connect route. Browsers
 * cannot set headers on a WebSocket handshake, so the ID token comes in
 * `?token=`. AUTH_MODE=cognito verifies it against the user pool (JWKS,
 * issuer, audience = COGNITO_CLIENT_ID, token_use = id); AUTH_MODE=local
 * verifies the harness's tokens. The caller's identity is passed to ws.ts as
 * authorizer context.
 */
let verifier: TokenVerifier | undefined;

export const handler = async (
  event: APIGatewayRequestAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  verifier ??= createTokenVerifier();
  const token = event.queryStringParameters?.token;
  try {
    if (!token) throw new Error('missing token');
    const { actor } = await verifier.verify(token);
    return {
      principalId: actor.id,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: event.methodArn }],
      },
      context: { sub: actor.id, email: actor.email, name: actor.name },
    };
  } catch {
    logger.info('ws connection refused', { reason: token ? 'invalid token' : 'no token' });
    // API Gateway turns this exact message into a 401 on the handshake.
    throw new Error('Unauthorized');
  }
};
