import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { DocumentTitle } from '../../../core/routing/title-strategy';
import { anAccountApi, setUpAccountPage, textsOf } from '../../../../testing/account-page';
import { anAccount, anOrder } from '../../../../testing/fixtures';

describe('AccountDetailPage', () => {
  it('opens on the users tab', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind');
    expect(page.url()).toBe('/accounts/acc_northwind/users');
    const tabs = page.host().querySelectorAll('[mat-tab-link]');
    expect(textsOf(page.host(), '[mat-tab-link]')).toEqual([
      'Users 30',
      'Sites 2',
      'Numbers 60',
      'Orders',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows who the customer is and how much they use', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/users');
    const host = page.host();

    expect(host.querySelector('h1')?.textContent).toBe('Northwind Dental');
    expect(textsOf(host, '.meta app-plan-badge, .meta app-status-chip')).toEqual([
      'Business',
      'Active',
    ]);
    const email = host.querySelector<HTMLAnchorElement>('.contact-email')!;
    expect(email.getAttribute('href')).toBe('mailto:rosa.diaz@northwind.example.com');
    expect(host.querySelector('.summary [role="meter"]')?.getAttribute('aria-valuetext')).toBe(
      '30 of 60 in use, 50%',
    );
    expect(textsOf(host, 'app-breadcrumbs li')).toEqual(['Accounts', 'Northwind Dental']);
  });

  it('puts New order in the header, linked to the order form', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/users');
    const action = page.host().querySelector<HTMLAnchorElement>('app-page-header [actions]')!;
    expect(action.textContent?.trim()).toBe('New order');
    expect(action.getAttribute('href')).toBe('/accounts/acc_northwind/orders/new');
  });

  it('names the account in the document title while it is open', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/users');
    TestBed.inject(DocumentTitle).setRouteTitle('Users');
    expect(TestBed.inject(Title).getTitle()).toBe('Users · Northwind Dental · Provisioning Portal');

    await page.go('/accounts');
    expect(TestBed.inject(Title).getTitle()).not.toContain('Northwind Dental');
  });

  it('says when an account does not exist, with a way back', async () => {
    const api = anAccountApi().fail('/accounts/acc_northwind', 404, 'Not found');
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');

    expect(page.host().querySelector('h1')?.textContent).toBe('Account not found');
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe(
      'No account with the ID acc_northwind',
    );
    expect(page.host().querySelector('app-empty-state a')?.getAttribute('href')).toBe('/accounts');
    expect(page.host().querySelector('nav[mat-tab-nav-bar]')).toBeNull();
  });

  it('shows other failures with a retry', async () => {
    const api = anAccountApi().fail('/accounts/acc_northwind', 500, 'The API is down.');
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');
    expect(page.host().querySelector('app-error-state')?.textContent).toContain('The API is down.');

    api.on('/accounts/acc_northwind', anAccount());
    page.host().querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await page.settle();
    expect(page.host().querySelector('h1')?.textContent).toBe('Northwind Dental');
  });

  it('refreshes the counts when one of its orders finishes', async () => {
    const api = anAccountApi();
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/sites');
    expect(page.realtime.subscribed).toContain('acc_northwind');

    api.on('/accounts/acc_northwind', anAccount({ userCount: 32 }));
    page.realtime.push(anOrder({ status: 'provisioning' }));
    await page.settle();
    expect(api.requestsTo('/accounts/acc_northwind')).toHaveLength(1);

    page.realtime.push(anOrder({ status: 'active' }));
    await page.settle();
    expect(api.requestsTo('/accounts/acc_northwind')).toHaveLength(2);
    expect(textsOf(page.host(), '.summary dd')[1]).toBe('32');
  });
});
