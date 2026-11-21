import type { Page } from '@playwright/test';
import { expectNoSeriousA11yViolations } from '../support/axe';
import { expect, test } from '../support/fixtures';
import { LoginPage } from '../support/login-page';

interface Scan {
  name: string;
  /** Opens the page and waits until its content (not a skeleton) is on screen. */
  open: (page: Page) => Promise<void>;
}

const heading = (page: Page, name: string | RegExp) =>
  expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

const PAGES: Scan[] = [
  {
    name: 'overview',
    open: async (page) => {
      await page.goto('/overview');
      await heading(page, 'Overview');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    },
  },
  {
    name: 'accounts',
    open: async (page) => {
      await page.goto('/accounts');
      // A table on wide screens, a list of cards on a phone.
      await expect(page.getByLabel('Accounts', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'account detail',
    open: async (page) => {
      await page.goto('/accounts/acc_mer-bleue/users');
      await heading(page, 'Mer Bleue Health Clinics');
      await expect(page.getByRole('tabpanel').getByLabel('Users', { exact: true })).toBeVisible();
    },
  },
  {
    name: 'new order',
    open: async (page) => {
      await page.goto('/accounts/acc_mer-bleue/orders/new');
      await expect(
        page.getByRole('list', { name: 'Order lines' }).getByRole('listitem'),
      ).toHaveCount(1);
    },
  },
  {
    name: 'order detail',
    open: async (page) => {
      await page.goto('/accounts/acc_mer-bleue/orders');
      await page.getByRole('tabpanel').getByRole('link').first().click();
      await expect(page.getByRole('list', { name: 'Order progress' })).toBeVisible();
    },
  },
  {
    name: 'assistant',
    open: async (page) => {
      await page.goto('/assistant');
      await page.getByRole('combobox', { name: 'Account' }).click();
      await page.getByRole('option', { name: 'Mer Bleue Health Clinics' }).click();
      await page
        .getByRole('textbox', { name: 'What should change?' })
        .fill('Turn off voicemail for everyone at Barrhaven');
      await page.getByRole('button', { name: 'Interpret' }).click();
      await expect(page.getByRole('region', { name: 'Order to approve' })).toBeVisible();
    },
  },
  {
    name: 'search',
    open: async (page) => {
      await page.goto('/search?q=Beaulieu');
      await expect(page.getByRole('region', { name: /^Users/ })).toBeVisible();
    },
  },
];

// Every page in both themes, on a wide screen and (tagged @mobile) on a phone.
const LAYOUTS = [
  { layout: 'wide screen', tag: [] },
  { layout: 'phone', tag: ['@mobile'] },
];

for (const colorScheme of ['light', 'dark'] as const) {
  for (const { layout, tag } of LAYOUTS) {
    test.describe(`accessibility, ${colorScheme} theme, ${layout}`, { tag }, () => {
      test.use({ colorScheme, reducedMotion: 'reduce' });

      for (const { name, open } of PAGES) {
        test(`${name} has no serious or critical axe violations`, async ({ page }, testInfo) => {
          await open(page);
          await expectNoSeriousA11yViolations(page, testInfo);
        });
      }

      test.describe('signed out', () => {
        test.use({ signedIn: false });

        test('login, with an error shown, has no serious or critical axe violations', async ({
          page,
        }, testInfo) => {
          await page.goto('/login');
          const login = new LoginPage(page);
          await login.signIn('admin@example.com', 'wrong');
          await expect(login.error).toBeVisible();
          await expectNoSeriousA11yViolations(page, testInfo);
        });
      });
    });
  }
}
