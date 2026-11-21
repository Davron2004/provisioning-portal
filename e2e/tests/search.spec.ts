import { expect, test } from '../support/fixtures';
import { bodyRows } from '../support/tables';

// From the deterministic demo seed (services/api/src/local/seed); no test changes this account.
const CONNOR = {
  name: 'Connor Beaulieu',
  number: '(753) 555-0105',
  account: 'Mer Bleue Health Clinics',
};

test('searching by name from the toolbar groups the results and opens the user', async ({
  page,
}) => {
  await page.goto('/overview');
  const toolbarSearch = page.getByRole('searchbox', { name: 'Search users, numbers and orders' });
  await toolbarSearch.fill('Beaulieu');
  await toolbarSearch.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=Beaulieu$/);
  await expect(page.getByRole('searchbox', { name: 'Search query' })).toHaveValue('Beaulieu');
  const users = page.getByRole('region', { name: /^Users/ });
  await expect(users.getByRole('heading', { level: 2 })).toHaveText(/Users\s*\d+/);
  const connor = users.getByRole('link', { name: new RegExp(CONNOR.name) });
  await expect(connor).toContainText(CONNOR.account);

  await connor.click();
  await expect(page).toHaveURL(/\/accounts\/acc_mer-bleue\/users\?q=Connor(%20|\+)Beaulieu$/);
  await expect(page.getByRole('heading', { level: 1, name: CONNOR.account })).toBeVisible();
  const rows = bodyRows(page.getByRole('table', { name: 'Users' }));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(CONNOR.name);
});

test('searching by number finds the number and the user who has it', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('searchbox', { name: 'Search query' }).fill('753 555 0105');

  await expect(page).toHaveURL(/[?&]q=753(%20|\+)555(%20|\+)0105/);
  const numbers = page.getByRole('region', { name: /^Numbers/ });
  const users = page.getByRole('region', { name: /^Users/ });
  await expect(numbers.getByRole('link')).toHaveCount(1);
  await expect(numbers.getByRole('link')).toContainText(CONNOR.number);
  await expect(numbers.getByRole('link')).toContainText(`Assigned to ${CONNOR.name}`);
  await expect(users.getByRole('link')).toHaveCount(1);
  await expect(users.getByRole('link')).toContainText(CONNOR.name);

  // The chips narrow the results to one kind.
  await page.getByRole('option', { name: /^Numbers/ }).click();
  await expect(page).toHaveURL(/[?&]entity=number/);
  await expect(users).toBeHidden();
  await expect(numbers.getByRole('link')).toHaveCount(1);

  await numbers.getByRole('link').click();
  await expect(page).toHaveURL(/\/accounts\/acc_mer-bleue\/numbers\?status=assigned$/);
  await expect(
    page.getByRole('table', { name: 'Numbers' }).getByRole('row', { name: /753.*555.*0105/ }),
  ).toBeVisible();
});

test('the keyboard moves through the results and back to the box', async ({ page }) => {
  await page.goto('/search?q=Beaulieu');
  const box = page.getByRole('searchbox', { name: 'Search query' });
  const results = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(results.first()).toBeVisible();
  const count = await results.count();
  expect(count).toBeGreaterThan(2);

  await box.focus();
  await page.keyboard.press('ArrowDown');
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(results.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(results.nth(count - 1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(box).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(box).toBeFocused();

  await page.keyboard.press('ArrowDown');
  const target = await results.nth(0).getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(target!);
});

test(
  'on a phone the toolbar has a search button instead of a box',
  { tag: '@mobile' },
  async ({ page }) => {
    await page.goto('/overview');
    await expect(
      page.getByRole('searchbox', { name: 'Search users, numbers and orders' }),
    ).toBeHidden();

    await page.getByRole('link', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search query' }).fill(CONNOR.name);
    await expect(
      page
        .getByRole('region', { name: /^Users/ })
        .getByRole('link')
        .first(),
    ).toContainText(CONNOR.name);
  },
);
