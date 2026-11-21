import { expect, test } from '../support/fixtures';
import { LoginPage } from '../support/login-page';
import { DEMO_USER } from '../support/session';

test.use({ signedIn: false });

test('a wrong password shows an error and stays on the sign-in page', async ({ page }) => {
  await page.goto('/login');
  const login = new LoginPage(page);

  await login.signIn(DEMO_USER.email, 'not-the-password');

  await expect(login.error).toHaveText('Incorrect email or password.');
  await expect(login.error).toBeFocused();
  await expect(page).toHaveURL(/\/login$/);
});

test('a signed-out visit goes to sign in, then back to the page asked for', async ({ page }) => {
  await page.goto('/accounts?status=active');

  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/accounts?status=active');

  await new LoginPage(page).signIn();

  await expect(page).toHaveURL(/\/accounts\?status=active$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
});

test('signing out ends the session', async ({ page }) => {
  await page.goto('/login');
  await new LoginPage(page).signIn();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  await page.getByRole('button', { name: `Account: ${DEMO_USER.name}` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Foverview$/);
});
