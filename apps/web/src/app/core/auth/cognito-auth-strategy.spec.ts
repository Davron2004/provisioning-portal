import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { COGNITO_CONFIG, fakeJwt, provideTestConfig } from '../../../testing/test-config';
import { CognitoAuthStrategy } from './cognito-auth-strategy';

const ENDPOINT = 'https://cognito-idp.ca-central-1.amazonaws.com/';

describe('CognitoAuthStrategy', () => {
  let http: HttpTestingController;
  let strategy: CognitoAuthStrategy;
  const credentials = { email: 'admin@example.com', password: 'secret' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTestConfig(COGNITO_CONFIG),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    strategy = TestBed.inject(CognitoAuthStrategy);
  });

  afterEach(() => http.verify());

  it('calls InitiateAuth with USER_PASSWORD_AUTH on the regional endpoint', () => {
    strategy.signIn(credentials).subscribe({ error: () => undefined });

    const req = http.expectOne(ENDPOINT);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Amz-Target')).toBe(
      'AWSCognitoIdentityProviderService.InitiateAuth',
    );
    expect(req.request.headers.get('Content-Type')).toBe('application/x-amz-json-1.1');
    expect(req.request.body).toEqual({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: 'client-123',
      AuthParameters: { USERNAME: 'admin@example.com', PASSWORD: 'secret' },
    });
    req.flush({});
  });

  it('builds the session from the ID token claims', async () => {
    const exp = Math.floor(Date.parse('2026-11-21T16:00:00Z') / 1000);
    const idToken = fakeJwt({ email: 'admin@example.com', name: 'Avery Admin', exp });
    const session = firstValueFrom(strategy.signIn(credentials));
    http.expectOne(ENDPOINT).flush({
      AuthenticationResult: { IdToken: idToken, AccessToken: 'a', ExpiresIn: 3600 },
    });

    await expect(session).resolves.toEqual({
      token: idToken,
      expiresAt: exp * 1000,
      user: { email: 'admin@example.com', name: 'Avery Admin' },
    });
  });

  it('falls back to given and family names, then to the email', async () => {
    const withNames = firstValueFrom(strategy.signIn(credentials));
    http.expectOne(ENDPOINT).flush({
      AuthenticationResult: {
        IdToken: fakeJwt({ email: 'a@example.com', given_name: 'Ana', family_name: 'Lima' }),
        ExpiresIn: 3600,
      },
    });
    expect((await withNames).user.name).toBe('Ana Lima');

    const emailOnly = firstValueFrom(strategy.signIn(credentials));
    http.expectOne(ENDPOINT).flush({
      AuthenticationResult: { IdToken: fakeJwt({ email: 'b@example.com' }), ExpiresIn: 3600 },
    });
    expect((await emailOnly).user.name).toBe('b@example.com');
  });

  it('explains a NEW_PASSWORD_REQUIRED challenge', async () => {
    const session = firstValueFrom(strategy.signIn(credentials));
    http.expectOne(ENDPOINT).flush({ ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's' });

    await expect(session).rejects.toThrow(/must set a new password/);
  });

  it.each([
    ['NotAuthorizedException', 'Incorrect email or password.'],
    ['com.amazonaws.cognito#UserNotConfirmedException', 'This account has not been confirmed yet.'],
    ['TooManyRequestsException', 'Too many attempts. Wait a moment and try again.'],
  ])('maps %s to a readable message', async (type, message) => {
    const session = firstValueFrom(strategy.signIn(credentials));
    http
      .expectOne(ENDPOINT)
      .flush({ __type: type, message: 'raw' }, { status: 400, statusText: 'Bad Request' });

    await expect(session).rejects.toThrow(message);
  });
});
