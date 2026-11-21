import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideTestConfig } from '../../../testing/test-config';
import { AuthError } from './auth-strategy';
import { LocalAuthStrategy } from './local-auth-strategy';

describe('LocalAuthStrategy', () => {
  let http: HttpTestingController;
  let strategy: LocalAuthStrategy;
  const credentials = { email: 'admin@example.com', password: 'secret' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestConfig()],
    });
    http = TestBed.inject(HttpTestingController);
    strategy = TestBed.inject(LocalAuthStrategy);
  });

  afterEach(() => http.verify());

  it('posts LocalLoginRequest to loginUrl and maps the response to a session', async () => {
    const session = firstValueFrom(strategy.signIn(credentials));
    const req = http.expectOne('http://api.test/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(credentials);
    req.flush({
      idToken: 'token-1',
      expiresAt: '2026-11-21T16:00:00.000Z',
      user: { email: 'admin@example.com', name: 'Avery Admin' },
    });

    await expect(session).resolves.toEqual({
      token: 'token-1',
      expiresAt: Date.parse('2026-11-21T16:00:00.000Z'),
      user: { email: 'admin@example.com', name: 'Avery Admin' },
    });
  });

  it('reports wrong credentials without echoing server internals', async () => {
    const session = firstValueFrom(strategy.signIn(credentials));
    http
      .expectOne('http://api.test/auth/login')
      .flush(
        { error: { code: 'unauthorized', message: 'user admin@example.com: bad hash' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    await expect(session).rejects.toEqual(new AuthError('Incorrect email or password.'));
  });

  it('reports an unreachable server', async () => {
    const session = firstValueFrom(strategy.signIn(credentials));
    http.expectOne('http://api.test/auth/login').error(new ProgressEvent('error'));

    await expect(session).rejects.toThrow(/Cannot reach the server/);
  });
});
