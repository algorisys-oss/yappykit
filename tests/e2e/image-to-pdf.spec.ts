import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

/**
 * Turning pictures into a PDF, in a real browser.
 *
 * The unit tests prove the geometry. What only a browser can prove is that the
 * file the visitor downloads has a page per picture, in the order the list
 * showed, turned the way each picture is turned. So the download is opened and
 * measured here rather than trusted.
 */

/** A real PNG of the given size, so the browser decodes genuine dimensions. */
function png(w: number, h: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  // Each row is a filter byte followed by w RGB triples.
  const idat = deflateSync(Buffer.alloc(h * (1 + w * 3)));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const file = (name: string, w: number, h: number) => ({
  name,
  mimeType: 'image/png',
  buffer: png(w, h),
});

/** Page sizes of the file the browser handed back, in order. */
async function downloadedPages(
  page: import('@playwright/test').Page,
): Promise<[number, number][]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /download/i }).click(),
  ]);
  const doc = await PDFDocument.load(await readFile(await download.path()));
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

const A4_PORTRAIT: [number, number] = [595, 842];
const A4_LANDSCAPE: [number, number] = [842, 595];

test('makes a page per picture, turned to match each one, on-device', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await expect(page.getByRole('heading', { name: /turn images into a pdf/i, level: 1 })).toBeVisible();

  await page.setInputFiles('input[type="file"]', [
    file('1-tall.png', 100, 200),
    file('2-wide.png', 200, 100),
  ]);
  await expect(page.getByText('Pages in the PDF: 2.')).toBeVisible();

  await page.getByRole('button', { name: /^make the pdf$/i }).click();
  await expect(page.getByRole('status')).toContainText('one PDF of 2 pages');

  expect(await downloadedPages(page)).toEqual([A4_PORTRAIT, A4_LANDSCAPE]);
});

test('reordering the list reorders the pages', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await page.setInputFiles('input[type="file"]', [
    file('1-tall.png', 100, 200),
    file('2-wide.png', 200, 100),
  ]);

  await page.getByRole('button', { name: 'Move 2-wide.png earlier' }).click();
  await page.getByRole('button', { name: /^make the pdf$/i }).click();
  await expect(page.getByRole('status')).toBeVisible();

  expect(await downloadedPages(page)).toEqual([A4_LANDSCAPE, A4_PORTRAIT]);
});

test('cuts the page to the picture when no border is asked for', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await page.setInputFiles('input[type="file"]', file('wide.png', 200, 100));

  await page.getByRole('radio', { name: 'No border' }).click();
  await page.getByRole('button', { name: /^make the pdf$/i }).click();
  await expect(page.getByRole('status')).toBeVisible();

  const pages = await downloadedPages(page);
  expect(pages).toHaveLength(1);
  const [w, h] = pages[0]!;
  expect(w / h).toBeCloseTo(2, 1);
});

test('skips a file it cannot read and keeps the rest', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await page.setInputFiles('input[type="file"]', [
    file('good.png', 100, 100),
    { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') },
  ]);

  await expect(page.getByText(/notes\.png could not be read/i)).toBeVisible();
  await expect(page.getByText('Pages in the PDF: 1.')).toBeVisible();
});

test('will not build a PDF with nothing in it', async ({ page }) => {
  await page.goto('/image-to-pdf');
  await expect(page.getByRole('button', { name: /^make the pdf$/i })).toBeDisabled();
});
