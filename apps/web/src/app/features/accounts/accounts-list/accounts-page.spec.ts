import { BreakpointObserver } from '@angular/cdk/layout';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { FakeApi, provideFakeApi } from '../../../../testing/fake-api';
import { aPage, anAccount } from '../../../../testing/fixtures';
import { provideTestConfig } from '../../../../testing/test-config';
import { provideAppIcons } from '../../../core/icons/icons';
import { SEARCH_DEBOUNCE_MS } from '../../../core/routing/query-params';
import { AccountsPage } from './accounts-page';

@Component({ template: 'account detail' })
class AccountStub {}

const ACCOUNTS = [
  anAccount({
    id: 'acc_bytown',
    name: 'Bytown Quill Legal',
    plan: 'essentials',
    status: 'onboarding',
    userCount: 13,
  }),
  anAccount({
    id: 'acc_hogsback',
    name: 'Hogsback Studio',
    plan: 'essentials',
    status: 'suspended',
    userCount: 11,
  }),
  anAccount({
    id: 'acc_lumen',
    name: 'Lumen Ridge Robotics',
    plan: 'enterprise',
    status: 'active',
    userCount: 91,
    numbersAssigned: 89,
    numbersTotal: 175,
  }),
];

describe('AccountsPage', () => {
  let api: FakeApi;
  let harness: RouterTestingHarness;

  const setup = async (url = '/accounts', { handset = false } = {}) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'accounts', component: AccountsPage },
            { path: 'accounts/:accountId', component: AccountStub },
          ],
          withComponentInputBinding(),
        ),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
        ...(handset
          ? [
              {
                provide: BreakpointObserver,
                useValue: { observe: () => of({ matches: true }), isMatched: () => true },
              },
            ]
          : []),
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
  };

  const host = () => harness.routeNativeElement!;
  const names = () =>
    [...host().querySelectorAll('td.mat-column-name a')].map((a) => a.textContent?.trim());
  const count = () => host().querySelector('.app-result-count')?.textContent?.trim();
  const url = () => TestBed.inject(Router).url;

  beforeEach(() => {
    api = new FakeApi().on('/accounts', aPage(ACCOUNTS));
  });

  it('lists accounts with plan, status, counts and number utilization', async () => {
    await setup();

    expect(names()).toEqual(['Bytown Quill Legal', 'Hogsback Studio', 'Lumen Ridge Robotics']);
    expect(count()).toBe('3 accounts');
    const lumen = host().querySelectorAll('tr.mat-mdc-row')[2]!;
    expect(lumen.querySelector('app-plan-badge')?.textContent?.trim()).toBe('Enterprise');
    expect(lumen.querySelector('app-status-chip')?.textContent?.trim()).toBe('Active');
    expect(lumen.querySelector('.mat-column-users')?.textContent?.trim()).toBe('91');
    expect(lumen.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe(
      '89 of 175 in use, 51%',
    );
  });

  it('makes each row one real link to the account', async () => {
    await setup();
    const link = host().querySelector<HTMLAnchorElement>('td.mat-column-name a')!;
    expect(link.getAttribute('href')).toBe('/accounts/acc_bytown');

    link.click();
    await harness.fixture.whenStable();
    expect(url()).toBe('/accounts/acc_bytown');
  });

  it('applies status and plan filters from the URL', async () => {
    await setup('/accounts?status=suspended');
    expect(names()).toEqual(['Hogsback Studio']);
    expect(count()).toBe('1 of 3 accounts');

    await harness.navigateByUrl('/accounts?plan=essentials');
    expect(names()).toEqual(['Bytown Quill Legal', 'Hogsback Studio']);

    await harness.navigateByUrl('/accounts?plan=no-such-plan');
    expect(names()).toHaveLength(3);
  });

  it('filters as you type and keeps the text in the URL', async () => {
    await setup();
    const input = host().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'lumen';
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();

    expect(names()).toEqual(['Lumen Ridge Robotics']);
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 20));
    await harness.fixture.whenStable();
    expect(url()).toBe('/accounts?q=lumen');
  });

  it('offers to clear filters when nothing matches', async () => {
    await setup('/accounts?q=nobody&status=active');
    expect(host().querySelector('app-empty-state')?.textContent).toContain(
      'No accounts match these filters',
    );
    // Offered once, in the empty state, not again in the filter bar.
    expect(host().querySelector('.app-filter-bar button')).toBeNull();

    host().querySelector<HTMLButtonElement>('app-empty-state button')!.click();
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 20));
    await harness.fixture.whenStable();

    expect(url()).toBe('/accounts');
    expect(names()).toHaveLength(3);
  });

  it('sorts by a column header and keeps the sort in the URL', async () => {
    await setup();
    const usersHeader = host().querySelector<HTMLElement>('th.mat-column-users')!;
    expect(host().querySelector('th.mat-column-name')?.getAttribute('aria-sort')).toBe('ascending');

    usersHeader.querySelector<HTMLElement>('[role="button"]')!.click();
    await harness.fixture.whenStable();

    expect(url()).toBe('/accounts?sort=users&dir=desc');
    expect(usersHeader.getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Lumen Ridge Robotics', 'Bytown Quill Legal', 'Hogsback Studio']);
  });

  it('loads the next page on request', async () => {
    api.on('/accounts', (request) =>
      request.params.get('cursor') === 'page-2'
        ? aPage([anAccount({ id: 'acc_mer', name: 'Mer Bleue Health' })])
        : aPage(ACCOUNTS, 'page-2'),
    );
    await setup();
    expect(count()).toBe('First 3 accounts');

    host().querySelector<HTMLButtonElement>('app-load-more button')!.click();
    await harness.fixture.whenStable();

    expect(names()).toContain('Mer Bleue Health');
    expect(names()).toHaveLength(4);
    expect(host().querySelector('app-load-more')).toBeNull();
    expect(count()).toBe('4 accounts');
  });

  it('shows an error with a retry', async () => {
    api.fail('/accounts', 503);
    await setup();
    expect(host().querySelector('app-error-state h2')?.textContent).toBe('Could not load accounts');

    api.on('/accounts', aPage(ACCOUNTS));
    host().querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await harness.fixture.whenStable();
    expect(names()).toHaveLength(3);
  });

  it('says when there are no accounts at all', async () => {
    api.on('/accounts', aPage([]));
    await setup();
    expect(host().querySelector('app-empty-state h2')?.textContent).toBe('No accounts yet');
  });

  it('shows cards instead of a table on a phone', async () => {
    await setup('/accounts', { handset: true });
    expect(host().querySelector('table')).toBeNull();
    const cards = host().querySelectorAll('.app-card');
    expect(cards).toHaveLength(3);
    expect(cards[2]?.querySelector('a')?.getAttribute('href')).toBe('/accounts/acc_lumen');
    expect(cards[2]?.textContent).toMatch(/2 sites\s*·\s*91 users/);
  });
});
