import { anAccountApi, setUpAccountPage, textsOf } from '../../../../../testing/account-page';
import { aPage } from '../../../../../testing/fixtures';
import { localTime } from './sites-tab';

describe('SitesTab', () => {
  it('shows each site with address, counts and extension range', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/sites');
    const [kanata] = page.host().querySelectorAll('.site');

    expect(textsOf(page.host(), '.site h2')).toEqual(['Kanata Campus', 'Ottawa HQ']);
    expect(kanata?.querySelector('address')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '4000 Innovation Drive Kanata, ON K2K 3G9',
    );
    expect(textsOf(kanata!, '.facts dd')).toEqual(['18', '12', '2100–2199']);
  });

  it('links to the users and numbers of each site', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/sites');
    const links = page.host().querySelectorAll<HTMLAnchorElement>('.site .links a');
    expect(links[0]?.getAttribute('href')).toBe('/accounts/acc_northwind/users?site=site_kanata');
    expect(links[1]?.getAttribute('href')).toBe('/accounts/acc_northwind/numbers?site=site_kanata');

    links[0]!.click();
    await page.settle();
    expect(page.url()).toBe('/accounts/acc_northwind/users?site=site_kanata');
  });

  it('shows an empty state for an account without sites', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/sites', aPage([]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/sites');
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe('No sites yet');
  });
});

describe('localTime', () => {
  it('formats the time in the site time zone', () => {
    expect(localTime('Asia/Tokyo', Date.parse('2026-11-21T20:05:00Z'))).toBe('5:05 AM');
    expect(localTime('Not/AZone', Date.now())).toBe('');
  });
});
