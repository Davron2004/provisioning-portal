import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { provideAppIcons } from '../app/core/icons/icons';
import { ACCOUNT_TAB_ROUTES } from '../app/features/accounts/account-detail/account-detail.routes';
import { AccountDetailPage } from '../app/features/accounts/account-detail/account-detail-page';
import { FakeApi, provideFakeApi } from './fake-api';
import { aDevice, aPage, aSite, anAccount } from './fixtures';
import { FakeRealtime, provideFakeRealtime } from './realtime-fake';
import { provideTestConfig } from './test-config';

@Component({ template: 'stub page' })
class StubPage {}

/** An API that serves one account with two sites and an empty everything else. */
export function anAccountApi(): FakeApi {
  return new FakeApi()
    .on('/accounts/acc_northwind', anAccount())
    .on(
      '/accounts/acc_northwind/sites',
      aPage([
        aSite(),
        aSite({
          id: 'site_ottawa',
          name: 'Ottawa HQ',
          extensionRange: { start: '2000', end: '2099' },
          userCount: 12,
          numbersAvailable: 18,
        }),
      ]),
    )
    .on('/accounts/acc_northwind/users', aPage([]))
    .on('/accounts/acc_northwind/numbers', aPage([]))
    .on('/accounts/acc_northwind/orders', aPage([]))
    .on('/catalog/devices', { items: [aDevice()] });
}

export interface AccountPageTest {
  readonly harness: RouterTestingHarness;
  readonly realtime: FakeRealtime;
  readonly host: () => HTMLElement;
  readonly url: () => string;
  /** Navigates within the test app and waits for every request to be answered. */
  readonly go: (url: string) => Promise<void>;
  readonly settle: () => Promise<void>;
}

/**
 * The account page with its real tab routes, against a FakeApi.
 * `handset` swaps in a phone-sized BreakpointObserver.
 */
export async function setUpAccountPage(
  api: FakeApi,
  url: string,
  { handset = false } = {},
): Promise<AccountPageTest> {
  const realtime = new FakeRealtime();
  const providers: Provider[] = handset
    ? [
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: true }), isMatched: () => true },
        },
      ]
    : [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'accounts', component: StubPage },
          { path: 'accounts/:accountId/orders/new', component: StubPage },
          { path: 'accounts/:accountId/orders/:orderId', component: StubPage },
          {
            path: 'accounts/:accountId',
            component: AccountDetailPage,
            children: ACCOUNT_TAB_ROUTES,
          },
        ],
        withComponentInputBinding(),
      ),
      provideAppIcons(),
      provideTestConfig(),
      provideFakeApi(api),
      provideFakeRealtime(realtime),
      ...providers,
    ],
  });
  const harness = await RouterTestingHarness.create();
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  const go = async (next: string) => {
    await harness.navigateByUrl(next);
    await settle();
  };
  await go(url);
  return {
    harness,
    realtime,
    host: () => harness.fixture.nativeElement as HTMLElement,
    url: () => TestBed.inject(Router).url,
    go,
    settle,
  };
}

/** Text of each matching element, whitespace collapsed. */
export function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map(
    (el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
}
