import { expect, test } from '@playwright/test';
import { bytesOf, measure, pngOf, sniff, unzip, type Rgb } from './helpers/fixtures';

/**
 * Converting between image formats, in a real browser.
 *
 * The interesting claim is the one about the format list: only formats this
 * browser can genuinely write are offered, because `canvas.toBlob` answers a
 * request it cannot honour by quietly returning a PNG. A tool that trusts the
 * request hands over a file called .webp that is a PNG inside, which the
 * receiving system then rejects.
 *
 * So the spec reads the magic bytes of what comes back rather than the file
 * name. That is the only way to tell the two apart.
 */

const WIDTH = 120;
const HEIGHT = 80;
const TEAL: Rgb = [20, 160, 160];

const picture = (n: number) =>
  pngOf(WIDTH, HEIGHT, (x) => (x < n * 10 ? [240, 240, 240] : TEAL));

async function load(page: import('@playwright/test').Page, count: number) {
  await page.goto('/convert-image-format');
  await page.setInputFiles(
    'input[type="file"]',
    Array.from({ length: count }, (_, i) => ({
      name: `shot-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: picture(i + 1),
    })),
  );
}

async function convert(page: import('@playwright/test').Page, linkName: RegExp) {
  await page.getByRole('button', { name: /^convert$/i }).click();
  await expect(page.getByRole('status')).toContainText(/converted/i, { timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: linkName }).first().click(),
  ]);
  return bytesOf(download);
}

test('a file asked for as JPEG really is a JPEG, not a renamed PNG', async ({ page }) => {
  await load(page, 1);
  await page.getByRole('radio', { name: /^jpeg/i }).click();
  // JPEG cannot hold transparency, and the tool says so before converting.
  await expect(page.getByText(/anything transparent is filled with white/i)).toBeVisible();

  const out = await convert(page, /^download$/i);
  expect(sniff(out)).toBe('jpeg');

  // Conversion keeps the full resolution; it is not a resizer.
  const seen = await measure(page, out);
  expect({ w: seen.width, h: seen.height }).toEqual({ w: WIDTH, h: HEIGHT });
});

test('several images come back as a ZIP, one entry each', async ({ page }) => {
  await load(page, 3);
  await page.getByRole('radio', { name: /^jpeg/i }).click();

  const parts = unzip(await convert(page, /^download all as a zip/i));
  expect(parts).toHaveLength(3);
  for (const part of parts) {
    expect(part.name).toMatch(/\.jpe?g$/i);
    expect(sniff(part.bytes)).toBe('jpeg');
  }
});

test('only formats the browser can really write are offered', async ({ page }) => {
  await load(page, 1);
  const formats = page.getByRole('radio');
  await expect(formats.first()).toBeVisible();

  // Whatever is on offer has to be honoured for real, whichever browser this is.
  const names = await formats.allInnerTexts();
  expect(names.join(' ')).toMatch(/JPEG/i);

  for (const label of names) {
    const expected = /png/i.test(label) ? 'png' : /webp/i.test(label) ? 'webp' : /jpeg/i.test(label) ? 'jpeg' : null;
    if (!expected) continue; // AVIF is not sniffed here
    await page.getByRole('radio', { name: label }).click();
    const out = await convert(page, /^download$/i);
    expect(sniff(out), `${label} produced the wrong format`).toBe(expected);
  }
});

test('skips a file that is not an image and converts the rest', async ({ page }) => {
  await page.goto('/convert-image-format');
  await page.setInputFiles('input[type="file"]', [
    { name: 'real.png', mimeType: 'image/png', buffer: picture(1) },
    { name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') },
  ]);
  await page.getByRole('radio', { name: /^jpeg/i }).click();
  await page.getByRole('button', { name: /^convert$/i }).click();

  await expect(page.getByText(/notes\.png could not be read/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status')).toContainText('1 converted');
});

test('will not convert with nothing chosen', async ({ page }) => {
  await page.goto('/convert-image-format');
  await page.getByRole('button', { name: /^convert$/i }).click();
  await expect(page.getByText(/choose at least one image first/i)).toBeVisible();
});
