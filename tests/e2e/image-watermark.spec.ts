import { expect, test, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';

/**
 * Watermarking, in a real browser.
 *
 * The unit tests prove where the marks go. Only a browser can prove that ink
 * actually lands there, so the downloaded file is decoded back into pixels here
 * and the quadrants are counted. A white page in, dark pixels only where the
 * plan said they would be.
 */

/** A real all-white PNG, so any dark pixel in the result came from the mark. */
function whitePng(w: number, h: number): Buffer {
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
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour RGB
  const rows = Buffer.alloc(h * (1 + w * 3), 0xff);
  for (let y = 0; y < h; y++) rows[y * (1 + w * 3)] = 0; // filter byte per row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const file = (name: string, w = 400, h = 400) => ({
  name,
  mimeType: 'image/png',
  buffer: whitePng(w, h),
});

interface Shot {
  name: string;
  width: number;
  height: number;
  /** Fraction of non-white pixels, per quadrant and overall. */
  topLeft: number;
  bottomRight: number;
  all: number;
}

/** Download the single result and measure where the ink landed. */
async function marked(page: Page, linkName = /^download /i): Promise<Shot> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: linkName }).first().click(),
  ]);
  const name = download.suggestedFilename();
  const bytes = await readFile(await download.path());

  const measured = await page.evaluate(async (base64: string) => {
    const binary = atob(base64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([buf]));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    const inked = (x0: number, y0: number, x1: number, y1: number) => {
      let n = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * bitmap.width + x) * 4;
          // The source is pure white, so anything darker is the mark.
          if (data[i]! < 240) n++;
          total++;
        }
      }
      return n / total;
    };
    const halfW = Math.floor(bitmap.width / 2);
    const halfH = Math.floor(bitmap.height / 2);
    return {
      width: bitmap.width,
      height: bitmap.height,
      topLeft: inked(0, 0, halfW, halfH),
      bottomRight: inked(halfW, halfH, bitmap.width, bitmap.height),
      all: inked(0, 0, bitmap.width, bitmap.height),
    };
  }, bytes.toString('base64'));

  return { name, ...measured };
}

test('signs one corner and leaves the rest of the picture alone', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await expect(
    page.getByRole('heading', { name: /add a watermark to your images/i, level: 1 }),
  ).toBeVisible();

  await page.setInputFiles('#watermark-files', file('photo.png'));
  await expect(page.getByText('Pictures to be marked: 1.')).toBeVisible();

  await page.getByLabel('Watermark text').fill('YAPPYKIT');
  await page.getByRole('button', { name: /^add the watermark$/i }).click();
  await expect(page.getByRole('status')).toContainText('Done: 1 marked');

  const shot = await marked(page);
  expect(shot.name).toBe('photo-watermarked.png');
  expect(shot.width).toBe(400);
  expect(shot.height).toBe(400);
  // Default anchor is bottom right, so that is the only quadrant with ink.
  expect(shot.bottomRight).toBeGreaterThan(0);
  expect(shot.topLeft).toBe(0);
});

test('protect tiles the whole frame, so a crop cannot lose the mark', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await page.setInputFiles('#watermark-files', file('scan.png'));
  await page.getByLabel('Watermark text').fill('CONFIDENTIAL');

  await page.getByRole('radio', { name: 'Protect it' }).click();
  await page.getByRole('button', { name: /^add the watermark$/i }).click();
  await expect(page.getByRole('status')).toContainText('Done: 1 marked');

  const shot = await marked(page);
  // Every quadrant carries ink, which is the whole point of the mode.
  expect(shot.topLeft).toBeGreaterThan(0);
  expect(shot.bottomRight).toBeGreaterThan(0);
});

test('the ID preset fills in a dated line and tiles it', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await page.setInputFiles('#watermark-files', file('passport.png'));

  await page.getByRole('button', { name: /set up an id scan watermark/i }).click();
  await expect(page.getByLabel('Watermark text')).toHaveValue(/Only for this application, /);
  await expect(page.getByRole('radio', { name: 'Protect it' })).toBeChecked();
});

test('a batch comes back as a ZIP as well as separate files', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await page.setInputFiles('#watermark-files', [file('a.png'), file('b.png')]);
  await page.getByLabel('Watermark text').fill('MINE');
  await page.getByRole('button', { name: /^add the watermark$/i }).click();
  await expect(page.getByRole('status')).toContainText('Done: 2 marked');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /download all 2 as a zip/i }).click(),
  ]);
  const zip = await readFile(await download.path());

  expect(download.suggestedFilename()).toBe('watermarked-images.zip');
  expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  expect(zip.includes(Buffer.from('a-watermarked.png'))).toBe(true);
  expect(zip.includes(Buffer.from('b-watermarked.png'))).toBe(true);
});

test('will not mark anything until there is a mark to apply', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  const action = page.getByRole('button', { name: /^add the watermark$/i });
  await expect(action).toBeDisabled();

  await page.setInputFiles('#watermark-files', file('photo.png'));
  await expect(action, 'a picture with no text is not enough').toBeDisabled();

  await page.getByLabel('Watermark text').fill('X');
  await expect(action).toBeEnabled();
});

test('skips a file it cannot read and keeps the rest', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await page.setInputFiles('#watermark-files', [
    file('good.png'),
    { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') },
  ]);

  await expect(page.getByText(/notes\.png could not be read/i)).toBeVisible();
  await expect(page.getByText('Pictures to be marked: 1.')).toBeVisible();
});
