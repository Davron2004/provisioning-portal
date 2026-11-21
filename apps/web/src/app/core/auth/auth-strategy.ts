import { Observable } from 'rxjs';

export interface SessionUser {
  readonly email: string;
  readonly name: string;
}

/** A signed-in session. `token` is the ID token sent as `Authorization: Bearer`. */
export interface Session {
  readonly token: string;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
  readonly user: SessionUser;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Thrown by a strategy when sign-in fails; `message` is safe to show. */
export class AuthError extends Error {
  override readonly name = 'AuthError';
}

/** How credentials become a session. Chosen from `auth.mode` in the runtime config. */
export abstract class AuthStrategy {
  abstract signIn(credentials: Credentials): Observable<Session>;
}
