import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

/**
 * Merging PDFs, in a real browser.
 *
 * The unit tests prove the copying; what only a browser can prove is that the
 * file the visitor actually downloads has the pages in the order the list
 * showed. So the download is opened and measured here rather than trusted.
 */

/** A PDF whose page sizes identify it, so order is visible in the output. */
async function pdfOf(sizes: [number, number][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  return Buffer.from(await doc.save());
}

async function addFiles(page: import('@playwright/test').Page) {
  await page.setInputFiles('input[type="file"]', [
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await pdfOf([[100, 100]]) },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: await pdfOf([[200, 200], [250, 250]]) },
  ]);
}

/** Page sizes of the file the browser handed back, in order. */
async function downloadedSizes(page: import('@playwright/test').Page): Promise<[number, number][]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /download/i }).click(),
  ]);
  const doc = await PDFDocument.load(await readFile(await download.path()));
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

test('merges the chosen PDFs in list order, on-device', async ({ page }) => {
  await page.goto('/merge-pdf');
  await expect(page.getByRole('heading', { name: /merge pdfs into one file/i, level: 1 })).toBeVisible();

  await addFiles(page);
  await expect(page.getByText('first.pdf')).toBeVisible();
  await expect(page.getByText('2 files, 3 pages in total.')).toBeVisible();

  await page.getByRole('button', { name: /^merge pdfs$/i }).click();
  await expect(page.getByRole('status')).toContainText('one PDF of 3 pages');

  expect(await downloadedSizes(page)).toEqual([[100, 100], [200, 200], [250, 250]]);
});

test('reordering the list reorders the merged document', async ({ page }) => {
  await page.goto('/merge-pdf');
  await addFiles(page);

  await page.getByRole('button', { name: 'Move second.pdf earlier' }).click();
  await page.getByRole('button', { name: /^merge pdfs$/i }).click();
  await expect(page.getByRole('status')).toBeVisible();

  expect(await downloadedSizes(page)).toEqual([[200, 200], [250, 250], [100, 100]]);
});

test('skips a file it cannot read and merges the rest', async ({ page }) => {
  await page.goto('/merge-pdf');
  await page.setInputFiles('input[type="file"]', [
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await pdfOf([[100, 100]]) },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: await pdfOf([[200, 200]]) },
    { name: 'notes.txt', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf at all') },
  ]);

  await expect(page.getByText(/notes\.txt could not be read/i)).toBeVisible();
  await expect(page.getByText('2 files, 2 pages in total.')).toBeVisible();
});

test('will not merge a single file', async ({ page }) => {
  await page.goto('/merge-pdf');
  await page.setInputFiles('input[type="file"]', {
    name: 'only.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfOf([[100, 100]]),
  });
  await expect(page.getByRole('button', { name: /^merge pdfs$/i })).toBeDisabled();
});
