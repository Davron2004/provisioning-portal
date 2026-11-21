import { expect, test } from '../support/fixtures';
import { OrderBuilder, uniqueTag } from '../support/order-builder';
import { bodyRows, cellText } from '../support/tables';

// Previews only: nothing here is submitted, so the account's data stays as seeded.
const ACCOUNT = 'acc_carling-pine';
const SITE = 'Mississauga Yard';

test('the preview blocks submitting while a line has an error, and shows it on the line', async ({
  page,
}) => {
  const tag = uniqueTag();
  const builder = new OrderBuilder(page);
  await builder.goto(ACCOUNT);
  await builder.fillUser(0, {
    firstName: 'Ines',
    lastName: `First ${tag}`,
    email: `ines.${tag}@carlingpine.example.com`,
    site: SITE,
    extension: '3399',
  });
  await builder.fillUser(1, {
    firstName: 'Omar',
    lastName: `Second ${tag}`,
    email: `omar.${tag}@carlingpine.example.com`,
    site: SITE,
    extension: '3399',
  });

  // The server's rules catch the repeated extension.
  await builder.preview();
  await expect(builder.verdict).toHaveText('1 error to fix before submitting');
  await expect(page.getByRole('list', { name: 'Problems on line 2' })).toHaveText(
    'error: Extension 3399 is also on line 1',
  );
  await expect(page.getByText('Fix the errors to submit.')).toBeVisible();
  await expect(builder.submit).toBeDisabled();

  // Back in the builder, the issue sits on the line that has it.
  await page.getByRole('button', { name: 'Back to edit' }).click();
  const extension = builder.lines.nth(1).getByRole('textbox', { name: 'Extension' });
  await expect(extension).toHaveAttribute('aria-invalid', 'true');
  await expect(extension).toHaveAccessibleDescription(/Extension 3399 is also on line 1/);
  await expect(builder.lines.first().getByRole('textbox', { name: 'Extension' })).toHaveAttribute(
    'aria-invalid',
    'false',
  );

  // Leaving the extension blank lets the server pick a free one.
  await extension.clear();
  await builder.preview();
  await expect(builder.verdict).toHaveText('Ready to submit');
  await expect(builder.submit).toBeEnabled();
});

test('an extension that is already someone’s is flagged before the preview', async ({ page }) => {
  // Find a real user at the site to collide with.
  await page.goto('/accounts/acc_carling-pine/users?site=site_cp-mississauga');
  const users = page.getByRole('table', { name: 'Users' });
  const firstUser = bodyRows(users).first();
  const name = (await cellText(users, firstUser, 'User')).split('\n')[0]!;
  const extension = await cellText(users, firstUser, 'Ext');

  const tag = uniqueTag();
  const builder = new OrderBuilder(page);
  await builder.goto(ACCOUNT);
  await builder.fillUser(0, {
    firstName: 'Lea',
    lastName: `Taken ${tag}`,
    email: `lea.${tag}@carlingpine.example.com`,
    site: SITE,
    extension,
  });
  await page.getByRole('button', { name: 'Preview order' }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Some lines need attention' }),
  ).toBeVisible();
  const field = builder.lines.first().getByRole('textbox', { name: 'Extension' });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(`Already ${name}’s extension`);
  await expect(builder.review).toBeHidden();
});
