import { expect, test } from '@playwright/test';
import { bytesOf, measure, pngOf, type Rgb } from './helpers/fixtures';

/**
 * Resizing, in a real browser.
 *
 * The promise is an exact size: if a form demands 400 by 400 then 400 by 400 is
 * what must come out, not 400 by 399. That is a claim about a canvas and a
 * codec, so it cannot be proved anywhere but in a browser, and it is the kind
 * of thing that breaks by one pixel when rounding moves.
 *
 * The other claim is that the tool says which of cropping or padding is about
 * to happen before the button is pressed, since those destroy different things
 * and the user is the only one who knows which is acceptable.
 */

const WIDTH = 400;
const HEIGHT = 200;
const LEFT: Rgb = [220, 40, 40];
const RIGHT: Rgb = [40, 90, 220];

/** Two halves, so a crop to the middle is visible in the output pixels. */
const wide = () => pngOf(WIDTH, HEIGHT, (x) => (x < WIDTH / 2 ? LEFT : RIGHT));

async function load(page: import('@playwright/test').Page) {
  await page.goto('/resize-image-to-exact-size');
  await page.setInputFiles('input[type="file"]', {
    name: 'banner.png',
    mimeType: 'image/png',
    buffer: wide(),
  });
  await expect(page.getByText(`banner.png, ${WIDTH} x ${HEIGHT}`)).toBeVisible();
}

async function resizeAndDownload(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /^resize to /i }).click();
      await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
      await page.getByRole('link', { name: /^download$/i }).click();
    })(),
  ]);
  return bytesOf(download);
}

test('gives exactly the pixels asked for, cropping to fill', async ({ page }) => {
  await load(page);
  await page.getByLabel(/^width$/i).fill('300');
  await page.getByLabel(/^height$/i).fill('300');

  // A 2:1 source cannot become a square without losing something, and the tool
  // has to say which before it happens.
  await expect(page.getByText(/the edges will be trimmed/i)).toBeVisible();

  const out = await measure(page, await resizeAndDownload(page), [
    [10, 150],
    [290, 150],
  ]);
  expect({ w: out.width, h: out.height }).toEqual({ w: 300, h: 300 });

  // Centre-cropped, so both halves of the banner survive around the middle.
  expect(out.pixels[0]![0]).toBeGreaterThan(out.pixels[0]![2]!); // still reddish
  expect(out.pixels[1]![2]).toBeGreaterThan(out.pixels[1]![0]!); // still bluish
});

test('pads instead of cropping when asked, keeping the whole picture', async ({ page }) => {
  await load(page);
  await page.getByLabel(/^width$/i).fill('300');
  await page.getByLabel(/^height$/i).fill('300');
  await page.getByRole('radio', { name: /fit inside, add a border/i }).click();
  await expect(page.getByText(/a white border fills the rest/i)).toBeVisible();

  const out = await measure(page, await resizeAndDownload(page), [
    [150, 4],
    [150, 296],
  ]);
  expect({ w: out.width, h: out.height }).toEqual({ w: 300, h: 300 });

  // A 2:1 picture inside a square leaves white bands top and bottom.
  for (const px of out.pixels) {
    expect(Math.min(...px)).toBeGreaterThan(230);
  }
});

test('warns before making an image bigger than the original', async ({ page }) => {
  await load(page);
  await page.getByLabel(/^width$/i).fill('1600');
  await page.getByLabel(/^height$/i).fill('800');
  await expect(page.getByText(/no detail is added by making an image bigger/i)).toBeVisible();

  const out = await measure(page, await resizeAndDownload(page));
  expect({ w: out.width, h: out.height }).toEqual({ w: 1600, h: 800 });
});

test('an odd requested size is still met exactly', async ({ page }) => {
  await load(page);
  await page.getByLabel(/^width$/i).fill('333');
  await page.getByLabel(/^height$/i).fill('167');

  const out = await measure(page, await resizeAndDownload(page));
  expect({ w: out.width, h: out.height }).toEqual({ w: 333, h: 167 });
});
