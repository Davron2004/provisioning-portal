import { expect, type Page } from '@playwright/test';

/** Opens the assistant with `account` chosen. */
export async function openAssistantFor(page: Page, account: string) {
  await page.goto('/assistant');
  const picker = page.getByRole('combobox', { name: 'Account' });
  // Disabled until the accounts have loaded (a select without options ignores clicks).
  await expect(picker).toBeEnabled();
  await picker.click();
  await page.getByRole('option', { name: account }).click();
}
