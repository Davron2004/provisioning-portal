import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LocalLoginRequest, LocalLoginResponse } from '@provisioning/contracts';
import { Observable, catchError, map, throwError } from 'rxjs';
import { toApiProblem } from '../api/api-problem';
import { AppConfig } from '../config/app-config';
import { AuthError, AuthStrategy, Credentials, Session } from './auth-strategy';

/** Local dev harness: POST loginUrl with LocalLoginRequest -> LocalLoginResponse. */
@Injectable({ providedIn: 'root' })
export class LocalAuthStrategy extends AuthStrategy {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  signIn(credentials: Credentials): Observable<Session> {
    const auth = this.config.value.auth;
    if (auth.mode !== 'local') {
      return throwError(() => new AuthError('Local sign-in is not enabled.'));
    }
    const body: LocalLoginRequest = { email: credentials.email, password: credentials.password };
    return this.http.post<unknown>(auth.loginUrl, body).pipe(
      map((response) => {
        const { idToken, expiresAt, user } = LocalLoginResponse.parse(response);
        return { token: idToken, expiresAt: Date.parse(expiresAt), user };
      }),
      catchError((error: unknown) => throwError(() => toAuthError(error))),
    );
  }
}

function toAuthError(error: unknown): AuthError {
  if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 401)) {
    return new AuthError('Incorrect email or password.');
  }
  return new AuthError(toApiProblem(error).message);
}
