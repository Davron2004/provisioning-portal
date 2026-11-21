import { expect, test } from '../support/fixtures';

const PAGES = ['Overview', 'Accounts', 'Orders', 'Assistant', 'Search'];

test('the side navigation opens every section and marks the current one', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/overview$/);
  const nav = page.getByRole('navigation', { name: 'Main' });

  for (const name of PAGES) {
    await nav.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle(`${name} · Provisioning Portal`);
  }
});

test('the sign-in page sends a signed-in person to the overview', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/overview$/);
});

test('the theme choice applies at once and survives a reload', async ({ page }) => {
  await page.goto('/overview');
  const html = page.locator('html');

  await page.getByRole('button', { name: /^Theme:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked();

  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Theme: Light' })).toBeVisible();
});

test(
  'on a phone the navigation is a drawer that closes after choosing a page',
  { tag: '@mobile' },
  async ({ page }) => {
    await page.goto('/overview');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const toggle = page.getByRole('button', { name: 'Expand navigation' });

    await expect(nav).toBeHidden();
    await toggle.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await nav.getByRole('link', { name: 'Accounts' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  },
);
