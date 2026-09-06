import { expect, test } from '@playwright/test';
import { bytesOf, jpegTakenAt, jpegWithoutExif, pngOf, unzip, type Rgb } from './helpers/fixtures';

/**
 * Renaming a batch, in a real browser.
 *
 * The naming rules are unit tested. What only a browser can settle is the part
 * that touches real files: that the EXIF date is actually read out of a JPEG,
 * that the ZIP entries carry the new names, and that the bytes inside them are
 * the original bytes rather than something re-encoded on the way through.
 *
 * EXIF timestamps carry no timezone and are read as local time, so the timezone
 * is pinned here. Without that, this suite would pass or fail depending on where
 * the machine running it happens to be.
 */
test.use({ timezoneId: 'UTC' });

const TEAL: Rgb = [20, 160, 160];

async function load(
  page: import('@playwright/test').Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.goto('/batch-rename-images');
  await page.setInputFiles('#rename-files', files);
  await expect(page.getByText('What you will get')).toBeVisible({ timeout: 30_000 });
}

async function download(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^rename \d+ and download$/i }).click();
  await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download the zip$/i }).click(),
  ]);
  return unzip(await bytesOf(file));
}

const jpg = (name: string, stamp?: string) => ({
  name,
  mimeType: 'image/jpeg',
  buffer: stamp ? jpegTakenAt(stamp) : jpegWithoutExif(),
});

test('numbers the batch and pads to its width', async ({ page }) => {
  // Twelve files, so the padding has to be two digits or a file manager sorts
  // shot-10 before shot-2, which is the problem the tool exists to solve.
  const files = Array.from({ length: 12 }, (_, i) => ({
    name: `IMG_${4800 + i}.png`,
    mimeType: 'image/png',
    buffer: pngOf(8, 8, () => TEAL),
  }));
  await load(page, files);
  await page.getByLabel(/^name$/i).fill('Holiday');

  const entries = await download(page);
  expect(entries).toHaveLength(12);
  expect(entries[0]!.name).toBe('Holiday-01.png');
  expect(entries[11]!.name).toBe('Holiday-12.png');
  // Sorted as text, they are still in the order they were given.
  const sorted = entries.map((e) => e.name).sort();
  expect(sorted).toEqual(entries.map((e) => e.name));
});

test('reads the date out of the photo and puts the oldest first', async ({ page }) => {
  await load(page, [
    jpg('later.jpg', '2024:11:02 18:20:21'),
    jpg('earlier.jpg', '2023:05:04 09:08:07'),
  ]);
  await page.getByRole('radio', { name: /^the date each was taken$/i }).click();

  const entries = await download(page);
  expect(entries.map((e) => e.name)).toEqual([
    '2023-05-04_09-08-07.jpg',
    '2024-11-02_18-20-21.jpg',
  ]);
});

test('keeps its own name for a photo that carries no date, and says so', async ({ page }) => {
  await load(page, [jpg('dated.jpg', '2023:05:04 09:08:07'), jpg('Scan Copy.jpg')]);
  await page.getByRole('radio', { name: /^the date each was taken$/i }).click();

  await expect(page.getByText(/1 photo carries no date/i)).toBeVisible();
  const entries = await download(page);
  expect(entries.map((e) => e.name)).toContain('2023-05-04_09-08-07.jpg');
  // Tidied rather than given a wrong date.
  expect(entries.map((e) => e.name)).toContain('scan-copy.jpg');
});

test('tidies existing names without inventing new ones', async ({ page }) => {
  await load(page, [
    { name: 'IMG_4821.png', mimeType: 'image/png', buffer: pngOf(8, 8, () => TEAL) },
    { name: 'Summer Holiday  2024.png', mimeType: 'image/png', buffer: pngOf(8, 8, () => TEAL) },
  ]);
  await page.getByRole('radio', { name: /^tidy what is there$/i }).click();

  const entries = await download(page);
  expect(entries.map((e) => e.name)).toEqual(['4821.png', 'summer-holiday-2024.png']);
});

test('never lets two files end up with the same name', async ({ page }) => {
  // A burst: the same capture second, so the timestamps collide.
  await load(page, [
    jpg('a.jpg', '2024:01:01 12:00:00'),
    jpg('b.jpg', '2024:01:01 12:00:00'),
  ]);
  await page.getByRole('radio', { name: /^the date each was taken$/i }).click();

  await expect(page.getByText(/1 name would have clashed/i)).toBeVisible();
  const entries = await download(page);
  expect(new Set(entries.map((e) => e.name)).size).toBe(2);
  expect(entries.map((e) => e.name)).toEqual([
    '2024-01-01_12-00-00.jpg',
    '2024-01-01_12-00-00-2.jpg',
  ]);
});

test('copies the bytes rather than re-encoding them', async ({ page }) => {
  // The claim that makes this the one image tool that cannot cost quality.
  const source = pngOf(8, 8, () => TEAL);
  await load(page, [{ name: 'original.png', mimeType: 'image/png', buffer: source }]);

  const entries = await download(page);
  expect(entries).toHaveLength(1);
  expect(Buffer.compare(entries[0]!.bytes, source)).toBe(0);
});

test('shows every old name beside its new one before anything is downloaded', async ({ page }) => {
  await load(page, [
    { name: 'IMG_0001.png', mimeType: 'image/png', buffer: pngOf(8, 8, () => TEAL) },
  ]);
  await page.getByLabel(/^name$/i).fill('Trip');
  await expect(page.getByText('IMG_0001.png')).toBeVisible();
  await expect(page.getByText('Trip-1.png')).toBeVisible();
});
