import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import { type OrderPushes, recordOrderPushes } from './live-orders';
import { SESSION_FILE, SESSION_STORAGE_KEY } from './session';

interface Options {
  /** Start every page signed in as the demo operator (default). `false` starts signed out. */
  signedIn: boolean;
}

interface Fixtures {
  /** The `order.updated` pushes the page has received over its WebSocket. */
  orderPushes: OrderPushes;
}

/**
 * The app keeps its token in sessionStorage, which `storageState` does not save.
 * So auth.setup.ts signs in once through the real login form and stores the
 * session, and every signed-in test seeds it into each new tab before the app boots.
 */
export const test = base.extend<Options & Fixtures>({
  signedIn: [true, { option: true }],
  context: async ({ context, signedIn }, use) => {
    if (signedIn) {
      const session = await readFile(SESSION_FILE, 'utf8');
      await context.addInitScript(
        ({ key, value }) => {
          // Only when absent, so the session the app stores itself always wins.
          if (window.sessionStorage.getItem(key) === null) {
            window.sessionStorage.setItem(key, value);
          }
        },
        { key: SESSION_STORAGE_KEY, value: session },
      );
    }
    await use(context);
  },
  orderPushes: async ({ page }, use) => {
    await use(recordOrderPushes(page));
  },
});

export { expect };
