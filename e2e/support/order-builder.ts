import { expect, type Locator, type Page } from '@playwright/test';

export interface NewUser {
  firstName: string;
  lastName: string;
  email: string;
  site: string;
  /** Blank lets the server pick the next free extension. */
  extension?: string;
}

/** The order builder at /accounts/:id/orders/new, and the review step after it. */
export class OrderBuilder {
  readonly lines: Locator;
  readonly review: Locator;
  readonly verdict: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page) {
    this.lines = page.getByRole('list', { name: 'Order lines' }).getByRole('listitem');
    this.review = page.getByRole('table', { name: 'What this order adds, changes and removes' });
    this.verdict = page.getByRole('status').filter({ hasText: /submit/ });
    this.submit = page.getByRole('button', { name: 'Submit order' });
  }

  async goto(accountId: string) {
    await this.page.goto(`/accounts/${accountId}/orders/new`);
    // The page starts with one blank "Add user" line once the account has loaded.
    await expect(this.lines).toHaveCount(1);
  }

  /** Fills line `index` (0-based), adding a line first when it does not exist yet. */
  async fillUser(index: number, user: NewUser) {
    if ((await this.lines.count()) <= index) {
      await this.page
        .getByRole('group', { name: 'Add a line' })
        .getByRole('button', { name: 'Add user' })
        .click();
    }
    const line = this.lines.nth(index);
    await line.getByRole('textbox', { name: 'First name' }).fill(user.firstName);
    const lastName = line.getByRole('textbox', { name: 'Last name' });
    await lastName.fill(user.lastName);
    // Leaving the last name suggests first.last@<account domain>; replace it with ours.
    await lastName.blur();
    const email = line.getByRole('textbox', { name: 'Email' });
    await expect(email).toHaveValue(/@/);
    await email.fill(user.email);
    await line.getByRole('combobox', { name: 'Site' }).click();
    await this.page.getByRole('option', { name: user.site, exact: true }).click();
    if (user.extension) {
      await line.getByRole('textbox', { name: 'Extension' }).fill(user.extension);
    }
  }

  async preview() {
    await this.page.getByRole('button', { name: 'Preview order' }).click();
    await expect(this.submit).toBeVisible();
  }

  /** The review row for one line, found by the user's email (desktop layout). */
  reviewRow(email: string): Locator {
    return this.review.getByRole('row').filter({ hasText: email });
  }
}

/** Unique per test and run, so reruns against the same data never collide. */
export function uniqueTag(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}
