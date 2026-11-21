import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  EnvironmentProviders,
  Injectable,
  Provider,
  computed,
  inject,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import * as z from 'zod';
import { AppConfig } from '../config/app-config';
import { NotificationService } from '../notifications/notification';
import { AuthStrategy, Credentials, Session } from './auth-strategy';
import { CognitoAuthStrategy } from './cognito-auth-strategy';
import { LocalAuthStrategy } from './local-auth-strategy';

export const SESSION_STORAGE_KEY = 'pp.session';

const StoredSession = z.object({
  token: z.string().min(1),
  expiresAt: z.number(),
  user: z.object({ email: z.string(), name: z.string() }),
});

/** setTimeout fires immediately for delays above 2^31 - 1 ms (about 24.8 days). */
const MAX_TIMER_DELAY = 2 ** 31 - 1;

/**
 * The signed-in session, as signals. The token is kept in sessionStorage so a reload
 * keeps you signed in but closing the tab does not. When the token expires (or the
 * API answers 401) the session ends and you are sent to sign in again.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly strategy = inject(AuthStrategy);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly session = signal<Session | null>(this.restore());

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);

  constructor() {
    this.scheduleExpiry(this.session());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.expiryTimer));
  }

  signIn(credentials: Credentials): Observable<Session> {
    return this.strategy.signIn(credentials).pipe(tap((session) => this.setSession(session)));
  }

  /** Signs out on request and returns to the sign-in page. */
  signOut(): void {
    this.setSession(null);
    void this.router.navigateByUrl('/login');
  }

  /**
   * Ends a session the server no longer accepts (expired or revoked) and asks the
   * person to sign in again, returning them to where they were afterwards.
   */
  expireSession(): void {
    if (!this.session()) {
      return;
    }
    this.setSession(null);
    this.notifications.info('Your session has expired. Sign in again to continue.');
    const returnUrl = this.router.url;
    void this.router.navigate(['/login'], {
      queryParams: returnUrl.startsWith('/login') ? {} : { returnUrl },
    });
  }

  private setSession(session: Session | null): void {
    this.session.set(session);
    this.scheduleExpiry(session);
    try {
      if (session) {
        this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        this.storage?.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable: the session lasts until the page is reloaded.
    }
  }

  private scheduleExpiry(session: Session | null): void {
    clearTimeout(this.expiryTimer);
    if (session) {
      const delay = Math.min(Math.max(session.expiresAt - Date.now(), 0), MAX_TIMER_DELAY);
      this.expiryTimer = setTimeout(() => this.expireSession(), delay);
    }
  }

  private restore(): Session | null {
    try {
      const raw = this.storage?.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = StoredSession.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.expiresAt > Date.now()) {
        return parsed.data;
      }
      this.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Unreadable or unavailable storage: start signed out.
    }
    return null;
  }
}

/** Picks the sign-in strategy from `auth.mode` in the runtime config. */
export function provideAuth(): EnvironmentProviders {
  const strategy: Provider = {
    provide: AuthStrategy,
    useFactory: () =>
      inject(AppConfig).value.auth.mode === 'cognito'
        ? inject(CognitoAuthStrategy)
        : inject(LocalAuthStrategy),
  };
  return makeEnvironmentProviders([strategy]);
}
