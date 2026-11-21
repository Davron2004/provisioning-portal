import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationService } from '../notifications/notification';
import { SESSION_STORAGE_KEY, AuthService } from './auth';
import { AuthError, AuthStrategy, Session } from './auth-strategy';

const NOW = Date.parse('2026-11-21T15:00:00Z');

const session = (overrides: Partial<Session> = {}): Session => ({
  token: 'token-1',
  expiresAt: NOW + 60 * 60_000,
  user: { email: 'admin@example.com', name: 'Avery Admin' },
  ...overrides,
});

describe('AuthService', () => {
  let strategy: { signIn: ReturnType<typeof vi.fn> };
  let router: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
    navigateByUrl: ReturnType<typeof vi.fn>;
  };
  let notifications: { info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    sessionStorage.clear();
    strategy = { signIn: vi.fn() };
    router = { url: '/accounts/acc_1', navigate: vi.fn(), navigateByUrl: vi.fn() };
    notifications = { info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStrategy, useValue: strategy },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notifications },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('starts signed out', () => {
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
  });

  it('signs in through the strategy and keeps the session in sessionStorage', () => {
    strategy.signIn.mockReturnValue(of(session()));
    const auth = TestBed.inject(AuthService);

    auth.signIn({ email: 'admin@example.com', password: 'secret' }).subscribe();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.name).toBe('Avery Admin');
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual(session());
  });

  it('stays signed out when the strategy fails', () => {
    strategy.signIn.mockReturnValue(
      throwError(() => new AuthError('Incorrect email or password.')),
    );
    const auth = TestBed.inject(AuthService);

    auth
      .signIn({ email: 'admin@example.com', password: 'nope' })
      .subscribe({ error: () => undefined });

    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('restores a stored session after a reload', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session()));
    expect(TestBed.inject(AuthService).token()).toBe('token-1');
  });

  it('discards an expired or malformed stored session', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session({ expiresAt: NOW - 1 })));
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    TestBed.resetTestingModule();
  });

  it('ends the session when the token expires and offers to come back', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session()));
    const auth = TestBed.inject(AuthService);

    vi.advanceTimersByTime(60 * 60_000 - 1);
    expect(auth.isAuthenticated()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(auth.isAuthenticated()).toBe(false);
    expect(notifications.info).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/accounts/acc_1' },
    });
  });

  it('signs out on request without a return URL', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session()));
    const auth = TestBed.inject(AuthService);

    auth.signOut();

    expect(auth.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    // The expiry timer was cancelled with the session.
    vi.advanceTimersByTime(2 * 60 * 60_000);
    expect(notifications.info).not.toHaveBeenCalled();
  });
});
