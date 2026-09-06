import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bytesOf } from './helpers/fixtures';

/**
 * Cleaning a spreadsheet, in a real browser.
 *
 * The order of operations is the whole point and it is invisible in the result
 * unless you look for it: trimming runs before the duplicate check, so " Alice "
 * and "Alice" are one row rather than two. A tool that dedupes first reports
 * fewer duplicates and leaves them in the file, which is the bug this fixture is
 * shaped to catch.
 *
 * The masking claim matters for a different reason. A masked value is a fixed
 * width, because the length of a phone number is itself a clue about the number.
 */

const CSV = [
  'Name,Phone,City',
  ' Alice , 555-1111 ,London', // trims into an exact duplicate of the next row
  'Alice,555-1111,London',
  ',,', //                        a blank row
  'Bob,555-2222,Paris',
  'Bob,555-2222,Paris', //        a plain duplicate
  'Carla,555-3333,Lisbon',
].join('\n');

async function load(page: import('@playwright/test').Page) {
  await page.goto('/clean-up-a-spreadsheet');
  await page.setInputFiles('input[type="file"]', {
    name: 'contacts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV, 'utf8'),
  });
  await expect(page.getByText(/^Rows$/)).toBeVisible({ timeout: 30_000 });
}

async function downloadCsv(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^download as csv$/i }).click();
  await expect(page.getByRole('status')).toContainText(/ready/i, { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download$/i }).click(),
  ]);
  return (await bytesOf(download)).toString('utf8');
}

test('trims before deduplicating, so a padded row is the same row', async ({ page }) => {
  await load(page);

  const csv = await downloadCsv(page);
  const rows = csv.trim().split(/\r?\n/);

  // Alice appears once despite being written twice, once with padding.
  expect(rows.filter((r) => r.startsWith('Alice'))).toHaveLength(1);
  expect(rows.filter((r) => r.startsWith('Bob'))).toHaveLength(1);
  expect(rows).toEqual(['Name,Phone,City', 'Alice,555-1111,London', 'Bob,555-2222,Paris', 'Carla,555-3333,Lisbon']);

  // And no padding survives into the output.
  expect(csv).not.toMatch(/ Alice|Alice /);
});

test('reports what it removed rather than only the result', async ({ page }) => {
  await load(page);

  const stats = page.locator('dl');
  await expect(stats).toContainText('Duplicates removed');
  await expect(stats).toContainText('Blank rows removed');
  await expect(stats).toContainText('Cells trimmed');
});

test('a masked column keeps its shape without its contents', async ({ page }) => {
  await load(page);
  // Mask the phone column, which is the one worth hiding.
  await page.getByRole('button', { name: /^mask$/i }).nth(1).click();

  const csv = await downloadCsv(page);
  expect(csv).toContain('••••••');
  expect(csv).not.toContain('555-1111');
  expect(csv).not.toContain('555-3333');

  // Fixed width, whatever the value was: the length is itself a clue.
  const masked = csv.trim().split(/\r?\n/).slice(1).map((r) => r.split(',')[1]);
  expect(new Set(masked).size).toBe(1);
});

test('a removed column is gone from the file, not blanked', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: /^remove$/i }).nth(2).click();

  const csv = await downloadCsv(page);
  expect(csv).not.toContain('City');
  expect(csv).not.toContain('Lisbon');
  expect(csv.trim().split(/\r?\n/)[0]).toBe('Name,Phone');
});

test('says so when the file is not a spreadsheet at all', async ({ page }) => {
  await page.goto('/clean-up-a-spreadsheet');
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]).drawText('x', { x: 10, y: 10, font: await doc.embedFont(StandardFonts.Helvetica) });
  await page.setInputFiles('input[type="file"]', {
    name: 'not-a-sheet.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(await doc.save()),
  });
  // Either it is rejected or it reads as a single junk column; what must not
  // happen is a silent success that produces an empty file.
  await expect(
    page.getByText(/could not be read as a spreadsheet|appears to be empty|^Rows$/).first(),
  ).toBeVisible({ timeout: 30_000 });
});
