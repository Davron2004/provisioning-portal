import { openAssistantFor } from '../support/assistant-page';
import { expect, test } from '../support/fixtures';
import { bodyRows } from '../support/tables';

// Lumen Ridge Robotics is the account with the Kanata site.
const ACCOUNT = 'Lumen Ridge Robotics';

test('a plain-English request becomes a reviewed order that provisions live', async ({
  page,
  orderPushes,
}) => {
  await openAssistantFor(page, ACCOUNT);
  const request = 'Add 3 users at the Kanata site with voicemail';
  await page.getByRole('textbox', { name: 'What should change?' }).fill(request);
  await page.getByRole('button', { name: 'Interpret' }).click();

  const understood = page.getByRole('region', { name: 'How the request was understood' });
  await expect(understood).toContainText(
    'Interpreted by: Rules (offline parser, no language model)',
  );
  await expect(understood.getByRole('listitem').first()).toHaveText(
    'Add 3 users at “Kanata”, with voicemail, no device',
  );

  // The order the person approves: three placeholder users at Kanata Campus, nothing provisioned yet.
  const review = page.getByRole('region', { name: 'Order to approve' });
  await expect(review.getByText('Nothing has been provisioned.')).toBeVisible();
  const lines = bodyRows(review.getByRole('table'));
  await expect(lines).toHaveCount(3);
  for (const line of await lines.all()) {
    await expect(line).toContainText(/New User \d\d/);
    await expect(line).toContainText('Kanata Campus');
    await expect(line.getByRole('cell', { name: 'On', exact: true })).toBeVisible();
  }
  await expect(page.getByRole('status').filter({ hasText: /submit/ })).toHaveText(
    'Ready to submit',
  );

  await review.getByRole('button', { name: 'Approve and submit' }).click();
  await expect(page).toHaveURL(/\/accounts\/acc_lumen-ridge\/orders\/ord_\w+$/);
  const orderId = page.url().split('/').at(-1)!;
  await expect(page.getByRole('figure')).toContainText(request);

  const progress = page.getByRole('list', { name: 'Order progress' }).getByRole('listitem');
  await expect(progress.last()).toHaveText(/Active/);
  await expect(page.getByText('Order active: all 3 lines provisioned.')).toBeAttached();
  await expect(page.getByRole('progressbar', { name: 'Lines finished' })).toHaveAttribute(
    'aria-valuenow',
    '3',
  );
  expect(orderPushes.statusesOf(orderId)).toEqual(
    expect.arrayContaining(['provisioning', 'active']),
  );
});

test('a request it cannot understand says so and orders nothing', async ({ page }) => {
  await openAssistantFor(page, ACCOUNT);
  await page.getByRole('textbox', { name: 'What should change?' }).fill('order pizza for the team');
  await page.getByRole('button', { name: 'Interpret' }).click();

  const note = page.getByRole('note');
  await expect(note).toContainText('Not understood, so left out:');
  await expect(note.getByRole('listitem')).toHaveText(['“order pizza for the team”']);
  await expect(page.getByText('Nothing to order from this request.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and submit' })).toBeHidden();
});
