import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from './auth';
import { authGuard, guestGuard, safeReturnUrl } from './auth-guards';

describe('auth guards', () => {
  const isAuthenticated = signal(false);

  beforeEach(() => {
    isAuthenticated.set(false);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isAuthenticated } }],
    });
  });

  const run = (guard: typeof authGuard, url = '/orders?status=failed') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  it('sends signed-out people to /login with a return URL', () => {
    const result = run(authGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/login?returnUrl=%2Forders%3Fstatus%3Dfailed',
    );
  });

  it('lets signed-in people through', () => {
    isAuthenticated.set(true);
    expect(run(authGuard)).toBe(true);
  });

  it('keeps signed-in people off the sign-in page', () => {
    expect(run(guestGuard)).toBe(true);
    isAuthenticated.set(true);
    expect(TestBed.inject(Router).serializeUrl(run(guestGuard) as UrlTree)).toBe('/');
  });
});

describe('safeReturnUrl', () => {
  it.each([
    ['/accounts/acc_1?tab=users', '/accounts/acc_1?tab=users'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example/path', '/'],
    ['/\\evil.example', '/'],
    ['/login?returnUrl=/x', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});
