import type { Locator, Page } from '@playwright/test';
import { DEMO_USER } from './session';

/** The sign-in form at /login. */
export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.error = page.getByRole('alert');
  }

  async signIn(email: string = DEMO_USER.email, password: string = DEMO_USER.password) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
