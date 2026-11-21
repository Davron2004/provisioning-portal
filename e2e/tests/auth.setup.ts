import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { DEMO_USER, SESSION_FILE, SESSION_STORAGE_KEY } from '../support/session';

setup('sign in through the login form', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_USER.email);
  await page.getByLabel('Password', { exact: true }).fill(DEMO_USER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  const session = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_STORAGE_KEY);
  expect(session, 'the app stores its session after signing in').toBeTruthy();
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, session!);
});
