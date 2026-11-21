import { anAccountApi, setUpAccountPage, textsOf } from '../../../../../testing/account-page';
import { aNumber, aPage } from '../../../../../testing/fixtures';

describe('NumbersTab', () => {
  it('lists the inventory with site, status and the order holding a number', async () => {
    const api = anAccountApi().on(
      '/accounts/acc_northwind/numbers',
      aPage([
        aNumber(),
        aNumber({
          e164: '+16135550101',
          siteId: 'site_ottawa',
          status: 'reserved',
          orderId: 'ord_0007',
        }),
      ]),
    );
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/numbers');

    expect(textsOf(page.host(), 'td.mat-column-number')).toEqual([
      '(613) 555-0100',
      '(613) 555-0101',
    ]);
    expect(textsOf(page.host(), 'td.mat-column-site')).toEqual(['Kanata Campus', 'Ottawa HQ']);
    expect(textsOf(page.host(), 'td.mat-column-status')).toEqual(['Available', 'Reserved']);
    expect(page.host().querySelector('td.mat-column-order a')?.getAttribute('href')).toBe(
      '/accounts/acc_northwind/orders/ord_0007',
    );
    expect(page.host().querySelector('.app-result-count')?.textContent?.trim()).toBe('2 numbers');
  });

  it('filters by site and status through the API and the URL', async () => {
    const api = anAccountApi();
    const page = await setUpAccountPage(
      api,
      '/accounts/acc_northwind/numbers?site=site_kanata&status=available',
    );
    const request = api.requestsTo('/accounts/acc_northwind/numbers').at(-1)!;
    expect(request.params.get('siteId')).toBe('site_kanata');
    expect(request.params.get('status')).toBe('available');
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe('No numbers match');

    const reserved = [...page.host().querySelectorAll('mat-button-toggle button')].find(
      (button) => button.textContent?.trim() === 'Reserved',
    ) as HTMLButtonElement;
    reserved.click();
    await page.settle();
    expect(page.url()).toBe('/accounts/acc_northwind/numbers?site=site_kanata&status=reserved');
    expect(api.requestsTo('/accounts/acc_northwind/numbers').at(-1)?.params.get('status')).toBe(
      'reserved',
    );

    page.host().querySelector<HTMLButtonElement>('app-empty-state button')!.click();
    await page.settle();
    expect(page.url()).toBe('/accounts/acc_northwind/numbers');
  });

  it('ignores a status that is not in the contract', async () => {
    const api = anAccountApi();
    await setUpAccountPage(api, '/accounts/acc_northwind/numbers?status=stolen');
    expect(api.requestsTo('/accounts/acc_northwind/numbers').at(-1)?.params.has('status')).toBe(
      false,
    );
  });

  it('shows an error with a retry', async () => {
    const api = anAccountApi().fail('/accounts/acc_northwind/numbers', 500, 'Inventory is down.');
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/numbers');
    expect(page.host().querySelector('app-error-state')?.textContent).toContain(
      'Inventory is down.',
    );

    api.on('/accounts/acc_northwind/numbers', aPage([aNumber()]));
    page.host().querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await page.settle();
    expect(textsOf(page.host(), 'td.mat-column-number')).toEqual(['(613) 555-0100']);
  });
});
