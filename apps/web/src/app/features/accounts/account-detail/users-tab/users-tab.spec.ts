import { anAccountApi, setUpAccountPage, textsOf } from '../../../../../testing/account-page';
import { aPage, aUser } from '../../../../../testing/fixtures';
import { SEARCH_DEBOUNCE_MS } from '../../../../core/routing/query-params';

const ADA = aUser();
const GRACE = aUser({
  id: 'usr_0002',
  siteId: 'site_ottawa',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace.hopper@northwind.example.com',
  extension: '2001',
  did: null,
  voicemail: false,
  device: null,
  status: 'provisioning',
});

describe('UsersTab', () => {
  const rows = (host: HTMLElement) => [...host.querySelectorAll('tr.mat-mdc-row')];
  const cell = (row: Element, column: string) =>
    row.querySelector(`.mat-column-${column}`)?.textContent?.replace(/\s+/g, ' ').trim();

  it('lists users with extension, DID, voicemail, device and status', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/users', aPage([ADA, GRACE]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');
    const [ada, grace] = rows(page.host());

    expect(textsOf(ada!, '.mat-column-name span')).toEqual([
      'Ada Lovelace',
      'ada.lovelace@northwind.example.com',
    ]);
    expect(cell(ada!, 'site')).toBe('Kanata Campus');
    expect(cell(ada!, 'extension')).toBe('2101');
    expect(cell(ada!, 'did')).toBe('(613) 555-0142');
    expect(cell(ada!, 'voicemail')).toBe('On');
    expect(cell(ada!, 'device')).toBe('D200 desk phone');
    expect(cell(ada!, 'status')).toBe('Active');

    expect(cell(grace!, 'did')).toBe('None');
    expect(cell(grace!, 'voicemail')).toBe('Off');
    expect(cell(grace!, 'device')).toBe('None');
    expect(cell(grace!, 'status')).toBe('Provisioning');
    expect(page.host().querySelector('table')?.getAttribute('aria-label')).toBe('Users');
  });

  it('asks the API for one site when the URL names it, and drops the site column', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/users', aPage([GRACE]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users?site=site_ottawa');

    expect(api.requestsTo('/accounts/acc_northwind/users').at(-1)?.params.get('siteId')).toBe(
      'site_ottawa',
    );
    expect(page.host().querySelector('th.mat-column-site')).toBeNull();
    expect(page.host().querySelector('mat-select')?.textContent).toContain('Ottawa HQ');
  });

  it('leaves out the voicemail column below 1280px wide', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/users', aPage([ADA]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users', { width: 1024 });

    expect(textsOf(page.host(), 'th')).toEqual(['User', 'Site', 'Ext', 'DID', 'Device', 'Status']);
  });

  const typeInBox = (page: Awaited<ReturnType<typeof setUpAccountPage>>, text: string) => {
    const input = page.host().querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    page.harness.fixture.detectChanges();
  };

  it('sends the text filter to the API, debounced and mirrored in the URL', async () => {
    const api = anAccountApi().onUsers('/accounts/acc_northwind/users', [ADA, GRACE]);
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');
    expect(rows(page.host())).toHaveLength(2);
    const before = api.requestsTo('/accounts/acc_northwind/users').length;

    typeInBox(page, 'h');
    typeInBox(page, 'hopper');
    // Nothing is sent while typing.
    expect(api.requestsTo('/accounts/acc_northwind/users')).toHaveLength(before);

    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 20));
    await page.settle();

    const sent = api.requestsTo('/accounts/acc_northwind/users');
    expect(sent).toHaveLength(before + 1);
    expect(sent.at(-1)?.params.get('q')).toBe('hopper');
    expect(page.url()).toBe('/accounts/acc_northwind/users?q=hopper');
    expect(rows(page.host()).map((row) => cell(row, 'extension'))).toEqual(['2001']);
    expect(page.host().querySelector('.app-result-count')?.textContent?.trim()).toBe('1 match');
  });

  it('starts from the q in the URL and finds users by phone number', async () => {
    const api = anAccountApi().onUsers('/accounts/acc_northwind/users', [ADA, GRACE]);
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users?q=555-0142');
    expect(api.requestsTo('/accounts/acc_northwind/users').at(-1)?.params.get('q')).toBe(
      '555-0142',
    );
    expect(rows(page.host()).map((row) => cell(row, 'extension'))).toEqual(['2101']);
  });

  it('shows "No users match" when the server finds nothing, and clears the filter', async () => {
    const api = anAccountApi().onUsers('/accounts/acc_northwind/users', [ADA, GRACE]);
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users?q=zzz');
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe('No users match');
    // Offered once, in the empty state, not again in the filter bar.
    expect(page.host().querySelector('.app-filter-bar button')).toBeNull();

    page.host().querySelector<HTMLButtonElement>('app-empty-state button')!.click();
    await page.settle();
    expect(page.url()).toBe('/accounts/acc_northwind/users');
    expect(rows(page.host())).toHaveLength(2);
  });

  it('loads more pages of a filtered list with the same q', async () => {
    const api = anAccountApi().onUsers('/accounts/acc_northwind/users', [ADA, GRACE], 1);
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users?q=example.com');
    expect(rows(page.host())).toHaveLength(1);
    expect(page.host().querySelector('.app-result-count')?.textContent?.trim()).toBe(
      'First 1 match',
    );

    page.host().querySelector<HTMLButtonElement>('app-load-more button')!.click();
    await page.settle();

    const last = api.requestsTo('/accounts/acc_northwind/users').at(-1)!;
    expect(last.params.get('q')).toBe('example.com');
    expect(last.params.get('cursor')).toBe('1');
    expect(rows(page.host())).toHaveLength(2);
    expect(page.host().querySelector('.app-result-count')?.textContent?.trim()).toBe('2 matches');
  });

  it('pages through users with the cursor, counting against the account total', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/users', (request) =>
      request.params.get('cursor') === 'next' ? aPage([GRACE]) : aPage([ADA], 'next'),
    );
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');
    expect(page.host().querySelector('.app-result-count')?.textContent?.trim()).toBe(
      '1 of 30 users',
    );

    page.host().querySelector<HTMLButtonElement>('app-load-more button')!.click();
    await page.settle();

    expect(rows(page.host())).toHaveLength(2);
    expect(page.host().querySelector('app-load-more')).toBeNull();
  });

  it('keeps loaded users when the next page fails, and retries it', async () => {
    let failNext = true;
    const api = anAccountApi().on('/accounts/acc_northwind/users', (request) => {
      if (request.params.get('cursor') !== 'next') {
        return aPage([ADA], 'next');
      }
      if (failNext) {
        failNext = false;
        throw new Error('network down');
      }
      return aPage([GRACE]);
    });
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users');
    page.host().querySelector<HTMLButtonElement>('app-load-more button')!.click();
    await page.settle();

    expect(rows(page.host())).toHaveLength(1);
    expect(page.host().querySelector('app-load-more [role="alert"]')?.textContent).toContain(
      'Could not load more users',
    );

    page.host().querySelector<HTMLButtonElement>('app-load-more button')!.click();
    await page.settle();
    expect(textsOf(page.host(), 'td.mat-column-extension')).toEqual(['2101', '2001']);
  });

  it('shows an empty state for an account without users', async () => {
    const page = await setUpAccountPage(anAccountApi(), '/accounts/acc_northwind/users');
    expect(page.host().querySelector('app-empty-state h2')?.textContent).toBe('No users yet');
  });

  it('shows users as cards on a phone', async () => {
    const api = anAccountApi().on('/accounts/acc_northwind/users', aPage([ADA]));
    const page = await setUpAccountPage(api, '/accounts/acc_northwind/users', { handset: true });
    expect(page.host().querySelector('table')).toBeNull();
    expect(textsOf(page.host(), '.app-card dd')).toEqual([
      '2101',
      '(613) 555-0142',
      'D200 desk phone',
      'On',
    ]);
  });
});
