import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { bytesOf, unzip } from './helpers/fixtures';

/** Read a workbook the app produced, in node, where xlsx resolves. */
function sheetRows(bytes: Buffer, index = 0): string[][] {
  const book = XLSX.read(bytes, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[index]!]!, {
    header: 1,
    raw: false,
    defval: '',
  });
}

/**
 * CSV to Excel and back, in a real browser.
 *
 * The interesting assertions are about bytes rather than about the screen. A
 * CSV that "looks right" in a test that reads it back as a string proves
 * nothing about how Excel will read it: what decides that is whether the first
 * three bytes are EF BB BF, so this spec checks the bytes.
 *
 * The other claim worth proving is that a leading zero survives the round trip
 * into a real .xlsx, which is the whole reason to convert rather than rename.
 */

const CSV = [
  'code,count,city',
  '01234,42,London',
  'SEPT1,7,Paris',
  '1234567890123456,0,Lisbon',
  'café,3,Zürich',
].join('\n');

async function load(
  page: import('@playwright/test').Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto('/csv-to-excel-converter');
  await page.setInputFiles('#convert-file', file);
  await expect(page.getByRole('button', { name: /^convert to /i })).toBeVisible({ timeout: 30_000 });
}

const csvFile = (text = CSV) => ({
  name: 'contacts.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(text, 'utf8'),
});

async function convert(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^convert to /i }).click();
  await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download/i }).first().click(),
  ]);
  return bytesOf(download);
}

test('a CSV becomes an .xlsx with the fragile values kept as text', async ({ page }) => {
  await load(page, csvFile());
  await expect(page.getByRole('button', { name: /^convert to excel$/i })).toBeVisible();
  // It says what it found before doing anything.
  await expect(page.getByText(/3 values would have been changed by Excel/i)).toBeVisible();

  const out = await convert(page);
  // A real .xlsx is a ZIP of XML parts.
  expect(out.subarray(0, 2).toString('latin1')).toBe('PK');

  // Read it back and check the values, rather than trusting the screen.
  const rows = sheetRows(out);

  expect(rows[1]![0], 'the leading zero must survive').toBe('01234');
  expect(rows[2]![0], 'a date-like code must stay a code').toBe('SEPT1');
  expect(rows[3]![0], 'a long number must not become scientific notation').toBe('1234567890123456');
  // And a real number is still a number, or every formula downstream breaks.
  expect(rows[1]![1]).toBe('42');
});

test('the CSV it writes begins with the bytes Excel needs', async ({ page }) => {
  // Give it a workbook so it converts the other way.
  const xlsx = await (async () => {
    await load(page, csvFile());
    return convert(page);
  })();

  await load(page, { name: 'book.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await expect(page.getByRole('button', { name: /^convert to csv$/i })).toBeVisible();

  const out = await convert(page);
  // EF BB BF, without which café opens as cafÃ© on Windows.
  expect([...out.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(out.toString('utf8')).toContain('café');
  // CRLF, as RFC 4180 and Excel expect.
  expect(out.toString('utf8')).toContain('\r\n');
});

test('turning the Excel option off removes the mark, and only that', async ({ page }) => {
  const xlsx = await (async () => {
    await load(page, csvFile());
    return convert(page);
  })();

  await load(page, { name: 'book.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await page.getByRole('checkbox').uncheck();

  const out = await convert(page);
  expect([...out.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
  expect(out.toString('utf8')).toContain('café');
});

test('a semicolon file is read as columns rather than as one', async ({ page }) => {
  await load(page, csvFile('name;city\nSmith, John;London\nDoe, Jane;Paris'));

  const rows = sheetRows(await convert(page));

  // Two columns, and the comma inside a name stayed part of the name.
  expect(rows[0]).toEqual(['name', 'city']);
  expect(rows[1]).toEqual(['Smith, John', 'London']);
});

test('warns about cells Excel would run as formulas', async ({ page }) => {
  await load(page, csvFile('name,note\nAlice,=1+1\nBob,@SUM(A1)'));
  await expect(page.getByText(/2 cells start with =, \+ or @/i)).toBeVisible();
});

test('every sheet of a workbook becomes its own CSV', async ({ page }) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['a'], ['1']]), 'Jan');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['b'], ['2']]), 'Feb');

  await load(page, {
    name: 'book.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer),
  });
  await expect(page.getByRole('heading', { name: 'Sheets', exact: true })).toBeVisible();

  const parts = unzip(await convert(page));
  expect(parts.map((p) => p.name)).toEqual(['book-Jan.csv', 'book-Feb.csv']);
});
