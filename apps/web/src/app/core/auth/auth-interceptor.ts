import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AppConfig } from '../config/app-config';
import { AuthService } from './auth';

/**
 * Adds `Authorization: Bearer <token>` to requests for our API (never to other
 * origins), and ends the session when the API rejects the token with 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  if (!token || !isApiRequest(req.url, inject(AppConfig).value.apiBaseUrl)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.expireSession();
      }
      return throwError(() => error);
    }),
  );
};

function isApiRequest(url: string, apiBaseUrl: string): boolean {
  const base = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;
  return url === apiBaseUrl || url.startsWith(base);
}
