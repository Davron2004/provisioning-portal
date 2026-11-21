import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { aPage, anAccount, anOverview } from '../../../testing/fixtures';
import { provideFakeRealtime } from '../../../testing/realtime-fake';
import { provideTestConfig } from '../../../testing/test-config';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth';
import { provideAppIcons } from '../../core/icons/icons';
import { AppTitleStrategy } from '../../core/routing/title-strategy';

describe('Shell and routes', () => {
  let harness: RouterTestingHarness;
  const isAuthenticated = signal(true);

  beforeEach(async () => {
    isAuthenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideFakeApi(
          new FakeApi()
            .on('/overview', anOverview())
            .on('/accounts/acc_northwind', anAccount())
            .on('/accounts/acc_northwind/sites', aPage([]))
            .on('/accounts/acc_northwind/users', aPage([]))
            .on('/accounts/acc_northwind/numbers', aPage([]))
            .on('/catalog/devices', { items: [] }),
        ),
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
        provideFakeRealtime(),
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
    await harness.navigateByUrl('/accounts/acc_northwind/orders/new');
    await harness.fixture.whenStable();
    expect(host().querySelector('h1')?.textContent).toBe('New order');
    // The account was loaded by the :accountId the page received.
    expect(host().querySelector('app-breadcrumbs')?.textContent).toContain('Northwind Dental');
  });

  it('opens an account on its first tab and names the account in the title', async () => {
    await harness.navigateByUrl('/accounts/acc_northwind');
    expect(TestBed.inject(Router).url).toBe('/accounts/acc_northwind/users');
    await harness.fixture.whenStable();
    expect(host().querySelector('h1')?.textContent).toBe('Northwind Dental');
    expect(TestBed.inject(Title).getTitle()).toBe('Users · Northwind Dental · Provisioning Portal');
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
