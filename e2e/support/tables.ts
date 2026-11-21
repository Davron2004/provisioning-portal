import type { Locator } from '@playwright/test';

/** Body rows of a table (the header row has column headers, not cells). */
export function bodyRows(table: Locator): Locator {
  return table.getByRole('row').filter({ has: table.page().getByRole('cell') });
}

/** The text of one row's cell under the column header `column`. */
export async function cellText(table: Locator, row: Locator, column: string): Promise<string> {
  const headers = (await table.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
  const index = headers.indexOf(column);
  if (index === -1) throw new Error(`No column "${column}" in ${headers.join(', ')}`);
  return (await row.getByRole('cell').nth(index).innerText()).trim();
}
