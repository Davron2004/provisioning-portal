import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import * as z from 'zod';
import { toApiProblem } from '../api/api-problem';
import { AppConfig } from '../config/app-config';
import { AuthError, AuthStrategy, Credentials, Session } from './auth-strategy';

// Shapes of the Cognito Identity Provider JSON API (not part of our contract).
const InitiateAuthResponse = z.object({
  AuthenticationResult: z
    .object({ IdToken: z.string(), ExpiresIn: z.number().int().positive() })
    .optional(),
  ChallengeName: z.string().optional(),
});

const CognitoErrorBody = z.object({ __type: z.string(), message: z.string().optional() });

const IdTokenClaims = z.object({
  email: z.string(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  exp: z.number().optional(),
});

const ERROR_MESSAGES: Record<string, string> = {
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotFoundException: 'Incorrect email or password.',
  UserNotConfirmedException: 'This account has not been confirmed yet.',
  PasswordResetRequiredException: 'This account needs a password reset before it can sign in.',
  TooManyRequestsException: 'Too many attempts. Wait a moment and try again.',
  LimitExceededException: 'Too many attempts. Wait a moment and try again.',
};

/**
 * Amazon Cognito user pool sign-in with USER_PASSWORD_AUTH, called directly on the
 * Cognito IdP JSON API (no SDK). Challenges such as NEW_PASSWORD_REQUIRED are not
 * handled in the portal; those accounts are reported as needing an administrator.
 */
@Injectable({ providedIn: 'root' })
export class CognitoAuthStrategy extends AuthStrategy {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  signIn(credentials: Credentials): Observable<Session> {
    const auth = this.config.value.auth;
    if (auth.mode !== 'cognito') {
      return throwError(() => new AuthError('Cognito sign-in is not enabled.'));
    }
    const url = `https://cognito-idp.${auth.region}.amazonaws.com/`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    });
    const body = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: auth.userPoolClientId,
      AuthParameters: { USERNAME: credentials.email, PASSWORD: credentials.password },
    };
    const requestedAt = Date.now();

    return this.http.post<unknown>(url, body, { headers }).pipe(
      map((response) => {
        const result = InitiateAuthResponse.parse(response);
        if (!result.AuthenticationResult) {
          throw new AuthError(
            result.ChallengeName === 'NEW_PASSWORD_REQUIRED'
              ? 'This account must set a new password first. Ask an administrator to reset it.'
              : 'This account needs an extra sign-in step the portal does not support.',
          );
        }
        const { IdToken, ExpiresIn } = result.AuthenticationResult;
        const claims = IdTokenClaims.parse(decodeJwtPayload(IdToken));
        return {
          token: IdToken,
          expiresAt: claims.exp ? claims.exp * 1000 : requestedAt + ExpiresIn * 1000,
          user: { email: claims.email, name: displayName(claims) },
        };
      }),
      catchError((error: unknown) => throwError(() => toAuthError(error))),
    );
  }
}

function displayName(claims: z.infer<typeof IdTokenClaims>): string {
  if (claims.name) {
    return claims.name;
  }
  const parts = [claims.given_name, claims.family_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : claims.email;
}

/** Reads a JWT's claims. The signature is verified by the API, not here. */
export function decodeJwtPayload(token: string): unknown {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new AuthError('The sign-in service returned an invalid token.');
  }
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    const body = CognitoErrorBody.safeParse(error.error);
    if (body.success) {
      // `__type` is either "NotAuthorizedException" or "<namespace>#NotAuthorizedException".
      const type = body.data.__type.split('#').at(-1) ?? '';
      return new AuthError(ERROR_MESSAGES[type] ?? body.data.message ?? 'Sign-in failed.');
    }
  }
  return new AuthError(toApiProblem(error).message);
}
