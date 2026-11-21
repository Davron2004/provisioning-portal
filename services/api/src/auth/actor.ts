import type { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorizedError } from '../errors';

/** The signed-in portal operator making a request. */
export interface Actor {
  /** Cognito `sub` (or the local harness user id). */
  id: string;
  email: string;
  name: string;
}

/**
 * Reads the caller from the claims the API Gateway Cognito authorizer puts on
 * the request context. The local harness verifies its own tokens and fills the
 * same shape. A request that reaches the Lambda without claims is rejected
 * rather than trusted.
 */
export function actorFromEvent(event: Pick<APIGatewayProxyEvent, 'requestContext'>): Actor {
  const claims = event.requestContext.authorizer?.claims as Record<string, unknown> | undefined;
  return actorFromClaims(claims);
}

export function actorFromClaims(claims: Record<string, unknown> | undefined | null): Actor {
  const id = claims?.sub;
  const email = claims?.email;
  if (typeof id !== 'string' || typeof email !== 'string' || !id || !email) {
    throw new UnauthorizedError();
  }
  const name = typeof claims?.name === 'string' && claims.name ? claims.name : email;
  return { id, email, name };
}
