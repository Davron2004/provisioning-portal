import { expect, test } from '../support/fixtures';
import { bodyRows, cellText } from '../support/tables';

test.describe('accounts list', () => {
  test('filters and sort are kept in the URL', async ({ page }) => {
    await page.goto('/accounts');
    const table = page.getByRole('table', { name: 'Accounts' });
    const rows = bodyRows(table);
    await expect(rows).toHaveCount(5);

    await page.getByRole('searchbox', { name: 'Filter by name or contact' }).fill('lumen');
    await expect(page).toHaveURL(/[?&]q=lumen/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Lumen Ridge Robotics');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows).toHaveCount(5);
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Suspended' }).click();
    await expect(page).toHaveURL(/[?&]status=suspended/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Hogsback Studio Collective');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    // Count columns sort largest first.
    await table.getByRole('button', { name: 'Users' }).click();
    await expect(page).toHaveURL(/[?&]sort=users&dir=desc/);
    await expect(table.getByRole('columnheader', { name: 'Users' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await expect(rows.first()).toContainText('Lumen Ridge Robotics');

    // The same URL, opened fresh, shows the same view.
    await page.goto('/accounts?status=active&sort=name&dir=desc');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Active');
    await expect(rows).toHaveText([
      /Mer Bleue Health Clinics/,
      /Lumen Ridge Robotics/,
      /Carling Pine Logistics/,
    ]);
  });

  test(
    'a phone shows accounts as cards that open the account',
    { tag: '@mobile' },
    async ({ page }) => {
      await page.goto('/accounts');
      const cards = page.getByRole('list', { name: 'Accounts' }).getByRole('listitem');
      await expect(cards).toHaveCount(5);

      await cards.filter({ hasText: 'Mer Bleue' }).getByRole('link').click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Mer Bleue Health Clinics' }),
      ).toBeVisible();
      await expect(
        page.getByRole('list', { name: 'Users' }).getByRole('listitem').first(),
      ).toBeVisible();
    },
  );
});

test.describe('account detail', () => {
  test('opens from the list and switches between its tabs', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByRole('link', { name: 'Lumen Ridge Robotics' }).click();

    await expect(page).toHaveURL(/\/accounts\/acc_lumen-ridge\/users$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Lumen Ridge Robotics' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Users · Lumen Ridge Robotics · Provisioning Portal');
    const tabs = page.getByRole('tablist', { name: 'Account sections' });

    const sections = [
      {
        tab: 'Sites',
        path: 'sites',
        content: page.getByRole('list', { name: 'Sites' }).getByText('Kanata Campus'),
      },
      { tab: 'Numbers', path: 'numbers', content: page.getByRole('table', { name: 'Numbers' }) },
      { tab: 'Orders', path: 'orders', content: page.getByRole('table', { name: 'Orders' }) },
      { tab: 'Users', path: 'users', content: page.getByRole('table', { name: 'Users' }) },
    ];
    for (const { tab, path, content } of sections) {
      // Tab names include their count, e.g. "Users 91".
      const link = tabs.getByRole('tab', { name: new RegExp(`^${tab}\\b`) });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`/accounts/acc_lumen-ridge/${path}$`));
      await expect(link).toHaveAttribute('aria-selected', 'true');
      await expect(content.first()).toBeVisible();
    }
  });

  test('the users tab filters on the server by name and by phone number', async ({ page }) => {
    await page.goto('/accounts/acc_mer-bleue/users');
    const table = page.getByRole('table', { name: 'Users' });
    const rows = bodyRows(table);
    const filter = page.getByRole('searchbox', { name: 'Filter by name, email or number' });
    await expect(rows).not.toHaveCount(0);

    // Pick a real user from the list rather than hard-coding seed data.
    const someone = rows.nth(3);
    const [name, email] = (await cellText(table, someone, 'User')).split('\n');
    const lastName = name!.split(' ').at(-1)!;
    const did = await cellText(table, someone, 'DID');

    const filtered = page.waitForResponse(
      (r) => r.url().includes('/accounts/acc_mer-bleue/users') && r.url().includes('q='),
    );
    await filter.fill(lastName);
    // The filtering happens on the server: the list is fetched again with ?q=.
    expect(new URL((await filtered).url()).searchParams.get('q')).toBe(lastName);
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(lastName);
    await expect(rows.filter({ hasNotText: new RegExp(lastName, 'i') })).toHaveCount(0);
    await expect(rows.filter({ hasText: email! })).toHaveCount(1);

    // The number as shown, e.g. "(753) 555-0105", finds its user.
    await filter.fill(did);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(email!);
    await expect(rows.first()).toContainText(did);

    await filter.fill('zzzz-nobody');
    await expect(page.getByRole('heading', { name: 'No users match' })).toBeVisible();
  });
});
