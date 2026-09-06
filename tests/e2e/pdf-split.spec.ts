import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bytesOf, pdfText, unzip } from './helpers/fixtures';

/**
 * Splitting and reordering a PDF, in a real browser.
 *
 * The page-range notation is unit tested. What only a browser can prove is that
 * the parsed list becomes those pages, in that order, in a file a reader will
 * open: the pages are copied rather than redrawn, so a mistake here produces a
 * plausible PDF with the wrong pages in it, which no unit test on a string can
 * catch.
 *
 * Every page carries its own number as text, so the output can be read back and
 * compared against the order that was asked for.
 */

const PAGES = 10;

async function numberedPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= PAGES; n += 1) {
    doc.addPage([300, 300]).drawText(`PAGE-${n}`, { x: 40, y: 150, size: 28, font });
  }
  return Buffer.from(await doc.save());
}

async function load(page: import('@playwright/test').Page) {
  await page.goto('/split-a-pdf');
  await page.setInputFiles('input[type="file"]', {
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: await numberedPdf(),
  });
  await expect(page.getByText(/report\.pdf, 10 pages/)).toBeVisible({ timeout: 30_000 });
}

async function keep(page: import('@playwright/test').Page, spec: string) {
  const field = page.getByLabel(/^pages to keep$/i);
  await field.fill(spec);
  await field.blur();
}

/**
 * Build the result, then take the file.
 *
 * The action button and the download are two steps: the first produces the PDF
 * and reports what it made, the second hands it over. Waiting for the status in
 * between is what keeps the click off a link that is not there yet.
 */
async function downloadOne(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^download as one pdf$/i }).click();
  await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download \d/i }).click(),
  ]);
  return bytesOf(download);
}

test('keeps exactly the pages asked for, in the order asked for', async ({ page }) => {
  await load(page);
  await keep(page, '1-3, 7');

  const out = await pdfText(await downloadOne(page));
  expect(out).toEqual(['PAGE-1', 'PAGE-2', 'PAGE-3', 'PAGE-7']);
});

test('a span written backwards reverses that run of pages', async ({ page }) => {
  await load(page);
  await keep(page, '10-1');

  const out = await pdfText(await downloadOne(page));
  expect(out).toEqual(
    Array.from({ length: PAGES }, (_, i) => `PAGE-${PAGES - i}`),
  );
});

test('an open end means everything from there to the last page', async ({ page }) => {
  await load(page);
  await keep(page, '8-');

  expect(await pdfText(await downloadOne(page))).toEqual(['PAGE-8', 'PAGE-9', 'PAGE-10']);
});

test('a repeated page really is repeated, rather than quietly deduplicated', async ({ page }) => {
  await load(page);
  await keep(page, '2, 2, 5');

  expect(await pdfText(await downloadOne(page))).toEqual(['PAGE-2', 'PAGE-2', 'PAGE-5']);
});

test('the pages come out as separate files when asked, one per page', async ({ page }) => {
  await load(page);
  await keep(page, '4-6');

  await page.getByRole('button', { name: /^download one file per page$/i }).click();
  await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download all as a zip$/i }).click(),
  ]);
  const parts = unzip(await bytesOf(download));
  expect(parts).toHaveLength(3);
  for (const [i, part] of parts.entries()) {
    expect(await pdfText(part.bytes)).toEqual([`PAGE-${4 + i}`]);
  }
});

test('the copy is lossless, so the text is still text', async ({ page }) => {
  await load(page);
  await keep(page, '1');

  // The whole claim of the tool: pages are copied, not rasterised. If that ever
  // changed, this comes back empty rather than with the page's own text.
  expect(await pdfText(await downloadOne(page))).toEqual(['PAGE-1']);
});

test('says which part of a page list it cannot honour', async ({ page }) => {
  await load(page);

  await keep(page, 'abc');
  await expect(page.getByText(/that is not a page list/i)).toBeVisible();

  await keep(page, '1-99');
  await expect(page.getByText(/asks for a page it does not have/i)).toBeVisible();

  await keep(page, '');
  await expect(page.getByText(/type which pages to keep/i)).toBeVisible();
});

test('does not split a PDF that already fits the size limit', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^by file size$/i }).click();
  await page.getByRole('button', { name: /^split into parts$/i }).click();

  // A ten page text PDF is a few kilobytes, so a 5 MB limit is already met and
  // offering a ZIP of one identical file would be a worse answer than saying so.
  await expect(page.getByText(/already fits the limit/i)).toBeVisible({ timeout: 30_000 });
});
