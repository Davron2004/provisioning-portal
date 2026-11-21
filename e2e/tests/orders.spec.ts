import { expect, test } from '../support/fixtures';
import { OrderBuilder, uniqueTag } from '../support/order-builder';

// Each test orders at its own site, so parallel tests never compete for extensions or numbers.
const ACCOUNT = 'acc_carling-pine';

test('a manual order shows its preview, then fails live on the +fail line, and a retry fails it again', async ({
  page,
  orderPushes,
}) => {
  const tag = uniqueTag();
  const ok = {
    firstName: 'Robin',
    lastName: `Ok ${tag}`,
    email: `robin.${tag}@carlingpine.example.com`,
  };
  const failing = {
    firstName: 'Sasha',
    lastName: `Fail ${tag}`,
    email: `sasha.${tag}+fail@carlingpine.example.com`,
  };
  const builder = new OrderBuilder(page);
  await builder.goto(ACCOUNT);
  await builder.fillUser(0, { ...ok, site: 'Ottawa Distribution Centre' });
  await builder.fillUser(1, { ...failing, site: 'Ottawa Distribution Centre' });

  await builder.preview();
  await expect(builder.verdict).toHaveText('Ready to submit');
  await expect(page.getByText('2 to add')).toBeVisible();
  for (const { email } of [ok, failing]) {
    const row = builder.reviewRow(email);
    // Extension and number were left blank: the server assigned the next free ones at the site.
    await expect(
      row.getByRole('cell', { name: /^31\d\d\b.*assigned automatically$/ }),
    ).toBeVisible();
    await expect(
      row.getByRole('cell', { name: /^\(343\) 555-01\d\d\b.*assigned automatically$/ }),
    ).toBeVisible();
  }

  await builder.submit.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${ACCOUNT}/orders/ord_\\w+$`));
  const orderId = page.url().split('/').at(-1)!;
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add 2 users at Ottawa Distribution Centre' }),
  ).toBeVisible();

  // No reload from here on: every change below arrives over the WebSocket.
  const progress = page.getByRole('list', { name: 'Order progress' }).getByRole('listitem');
  const lines = page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: 'Attempts' }) });
  const failedLine = lines.getByRole('row').filter({ hasText: failing.lastName });
  const okLine = lines.getByRole('row').filter({ hasText: ok.lastName });

  await expect(progress.last()).toHaveText(/Failed/);
  await expect(page.getByText('Order failed: 1 of 2 lines failed, 1 succeeded.')).toBeAttached();
  await expect(failedLine).toContainText(
    /Call server rejected extension 31\d\d: conflicts with a hunt group in the dial plan/,
  );
  await expect(okLine).toContainText('Done');
  expect(orderPushes.statusesOf(orderId)).toEqual(
    expect.arrayContaining(['provisioning', 'failed']),
  );

  // Retrying only re-runs the failed line; +fail fails every time, by design.
  const retry = page.getByRole('button', { name: 'Retry failed lines' });
  await retry.click();
  await expect(failedLine.getByRole('cell').last()).toHaveText('2');
  await expect(progress.last()).toHaveText(/Failed/);
  await expect(retry).toBeVisible();
  await expect(okLine.getByRole('cell').last()).toHaveText('1');
  await expect
    .poll(() => orderPushes.statusesOf(orderId).filter((status) => status === 'failed').length)
    .toBe(2);
});

test('a +flaky line fails once, is retried automatically, and the order goes active', async ({
  page,
  orderPushes,
}) => {
  const tag = uniqueTag();
  const flaky = {
    firstName: 'Jules',
    lastName: `Flaky ${tag}`,
    email: `jules.${tag}+flaky@carlingpine.example.com`,
  };
  const builder = new OrderBuilder(page);
  await builder.goto(ACCOUNT);
  await builder.fillUser(0, { ...flaky, site: 'Gatineau Depot' });
  await builder.preview();
  await builder.submit.click();
  await expect(page).toHaveURL(/\/orders\/ord_\w+$/);
  const orderId = page.url().split('/').at(-1)!;

  const progress = page.getByRole('list', { name: 'Order progress' }).getByRole('listitem');
  const line = page.getByRole('row').filter({ hasText: flaky.lastName });
  await expect(progress.last()).toHaveText(/Active/);
  await expect(page.getByText('Order active: all 1 line provisioned.')).toBeAttached();
  await expect(line).toContainText('Done');
  await expect(line.getByRole('cell').last()).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Retry failed lines' })).toBeHidden();
  expect(orderPushes.statusesOf(orderId)).toEqual(
    expect.arrayContaining(['provisioning', 'active']),
  );
});

test(
  'on a phone, the review and the live order show their lines as cards',
  { tag: '@mobile' },
  async ({ page }) => {
    const tag = uniqueTag();
    const user = {
      firstName: 'Noor',
      lastName: `Phone ${tag}`,
      email: `noor.${tag}@lumenridge.example.com`,
    };
    const builder = new OrderBuilder(page);
    await builder.goto('acc_lumen-ridge');
    await builder.fillUser(0, { ...user, site: 'Gatineau Office' });
    await builder.preview();

    const reviewCard = page.getByRole('list', { name: 'Order lines' }).getByRole('listitem');
    await expect(reviewCard).toHaveCount(1);
    await expect(reviewCard).toContainText(user.email);
    await expect(reviewCard).toContainText(/Extension\s*23\d\d/);

    await builder.submit.click();
    await expect(page).toHaveURL(/\/orders\/ord_\w+$/);
    const lineCard = page.getByRole('list', { name: 'Lines' }).getByRole('listitem');
    await expect(
      page.getByRole('list', { name: 'Order progress' }).getByRole('listitem').last(),
    ).toHaveText(/Active/);
    await expect(lineCard).toContainText(`${user.firstName} ${user.lastName}`);
    await expect(lineCard).toContainText('Done');
  },
);
