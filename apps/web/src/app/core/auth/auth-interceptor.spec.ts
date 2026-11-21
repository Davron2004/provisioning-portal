import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestConfig } from '../../../testing/test-config';
import { AuthService } from './auth';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  const token = signal<string | null>('token-1');
  const expireSession = vi.fn();

  beforeEach(() => {
    token.set('token-1');
    expireSession.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideTestConfig(),
        { provide: AuthService, useValue: { token, expireSession } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  it('adds the bearer token to API requests', () => {
    client.get('http://api.test/accounts').subscribe();
    const req = http.expectOne('http://api.test/accounts');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({});
  });

  it('never sends the token to other origins', () => {
    client.get('https://cognito-idp.ca-central-1.amazonaws.com/').subscribe();
    client.get('http://api.test.evil.example/accounts').subscribe();
    for (const req of http.match(() => true)) {
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });

  it('sends nothing extra when signed out', () => {
    token.set(null);
    client.get('http://api.test/accounts').subscribe();
    const req = http.expectOne('http://api.test/accounts');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('ends the session when the API rejects the token, and still reports the error', () => {
    const error = vi.fn();
    client.get('http://api.test/accounts').subscribe({ error });
    http
      .expectOne('http://api.test/accounts')
      .flush(
        { error: { code: 'unauthorized', message: 'Token expired' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(expireSession).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not end the session for other errors', () => {
    client.get('http://api.test/accounts').subscribe({ error: () => undefined });
    http.expectOne('http://api.test/accounts').flush(null, { status: 500, statusText: 'Error' });
    expect(expireSession).not.toHaveBeenCalled();
  });
});
