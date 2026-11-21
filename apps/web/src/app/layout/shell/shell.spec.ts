import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTestConfig } from '../../../testing/test-config';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth';
import { provideAppIcons } from '../../core/icons/icons';
import { RealtimeService } from '../../core/realtime/realtime';
import { AppTitleStrategy } from '../../core/routing/title-strategy';

describe('Shell and routes', () => {
  let harness: RouterTestingHarness;
  const isAuthenticated = signal(true);

  beforeEach(async () => {
    isAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideAppIcons(),
        provideTestConfig(),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            user: signal({ email: 'admin@example.com', name: 'Avery Admin' }),
            signOut: vi.fn(),
          },
        },
        { provide: RealtimeService, useValue: { state: signal('live') } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  const host = () => harness.routeNativeElement!.ownerDocument;

  it('redirects / to the overview and titles the page', async () => {
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Title).getTitle()).toBe('Overview · Provisioning Portal');
    expect(host().querySelector('h1')?.textContent).toBe('Overview');
  });

  it('marks the active section in the navigation', async () => {
    await harness.navigateByUrl('/accounts/acc_northwind/orders/ord_0001');
    const current = host().querySelector('app-side-nav [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Accounts');
  });

  it('moves focus to the new page heading after navigating', async () => {
    await harness.navigateByUrl('/overview');
    await harness.navigateByUrl('/orders');
    await harness.fixture.whenStable();

    const active = host().activeElement;
    expect(active?.tagName).toBe('H1');
    expect(active?.textContent).toBe('Orders');
  });

  it('binds route parameters to page inputs', async () => {
    await harness.navigateByUrl('/accounts/acc_northwind');
    expect(host().querySelector('h1')?.textContent).toBe('acc_northwind');
    expect(host().querySelector('app-breadcrumbs')?.textContent).toContain('Accounts');
  });

  it('shows a not-found page for unknown paths', async () => {
    await harness.navigateByUrl('/no/such/page');
    expect(TestBed.inject(Title).getTitle()).toBe('Page not found · Provisioning Portal');
  });

  it('sends signed-out visitors to sign in', async () => {
    isAuthenticated.set(false);
    await harness.navigateByUrl('/orders');
    expect(TestBed.inject(Title).getTitle()).toBe('Sign in · Provisioning Portal');
  });
});
