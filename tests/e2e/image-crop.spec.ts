import { expect, test } from '@playwright/test';
import { bytesOf, dragAcross, measure, pngOf, type Rgb } from './helpers/fixtures';

/**
 * Cropping, in a real browser.
 *
 * The unit tests prove `fitAspect` in the abstract. What only a browser can
 * prove is that a drag on a scaled-down preview becomes the right pixels of the
 * full-size original, and that the ratio survives that journey.
 *
 * The fixture is deliberately 2:1. On a square image every bug in this area is
 * invisible, because a selection stored as fractions is accidentally correct
 * when the axes are the same length. On a 2:1 image, half the width and half
 * the height is 2:1 rather than square, so a tool that constrains ratios in
 * fraction space fails here and only here.
 */

const WIDTH = 400;
const HEIGHT = 200;
const RED: Rgb = [220, 40, 40];
const GREEN: Rgb = [40, 180, 60];
const BLUE: Rgb = [40, 90, 220];
const YELLOW: Rgb = [230, 200, 40];

/** Four quadrants, so the crop can be shown to come from the right one. */
const quadrants = () =>
  pngOf(WIDTH, HEIGHT, (x, y) => {
    const right = x >= WIDTH / 2;
    const bottom = y >= HEIGHT / 2;
    return bottom ? (right ? YELLOW : BLUE) : right ? GREEN : RED;
  });

async function load(page: import('@playwright/test').Page) {
  await page.goto('/crop-an-image');
  await page.setInputFiles('input[type="file"]', {
    name: 'quadrants.png',
    mimeType: 'image/png',
    buffer: quadrants(),
  });
  await expect(page.getByText(`quadrants.png, ${WIDTH} x ${HEIGHT}`)).toBeVisible();
  return page.locator('img[src^="blob:"]').first();
}

/** The pixel size the tool says it has selected. */
async function selection(page: import('@playwright/test').Page) {
  const text = await page.getByText(/^Selection: \d+ x \d+ pixels$/).innerText();
  const [, w, h] = text.match(/(\d+) x (\d+)/)!;
  return { w: Number(w), h: Number(h) };
}

async function cropAndDownload(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /^crop$/i }).click();
      await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
      await page.getByRole('link', { name: /^download$/i }).click();
    })(),
  ]);
  return bytesOf(download);
}

test('a square selection on a 2:1 image is square in pixels, not in fractions', async ({
  page,
}) => {
  const preview = await load(page);
  await page.getByRole('button', { name: /^square$/i }).click();

  // 0.4 by 0.4 of the frame: 160 x 80 pixels, which is 2:1 and not a square.
  await dragAcross(page, preview, [0.55, 0.05], [0.95, 0.45]);

  const sel = await selection(page);
  expect(sel.w).toBe(sel.h);

  const out = await measure(page, await cropAndDownload(page), [
    [2, 2],
    [-3, -3],
  ]);
  expect(out.width).toBe(out.height);
  expect(Math.abs(out.width - sel.w)).toBeLessThanOrEqual(1);

  // And it came from the quadrant that was dragged over, not from the middle.
  for (const px of out.pixels) {
    for (const [i, channel] of GREEN.entries()) {
      expect(Math.abs(px[i]! - channel)).toBeLessThan(12);
    }
  }
});

test('switching ratio re-fits the selection instead of clearing it', async ({ page }) => {
  const preview = await load(page);
  await page.getByRole('button', { name: /^square$/i }).click();
  await dragAcross(page, preview, [0.55, 0.05], [0.95, 0.45]);
  const square = await selection(page);

  await page.getByRole('button', { name: /^16:9$/ }).click();
  const wide = await selection(page);
  expect(wide.w / wide.h).toBeCloseTo(16 / 9, 1);

  // Constraining shrinks the long side rather than growing the short one, or a
  // selection drawn near an edge would be pushed outside the picture.
  expect(wide.w).toBeLessThanOrEqual(square.w);
  expect(wide.h).toBeLessThanOrEqual(square.h);

  await page.getByRole('button', { name: /^9:16 tall$/i }).click();
  const tall = await selection(page);
  expect(tall.w / tall.h).toBeCloseTo(9 / 16, 1);
});

test('the whole image at a ratio is the largest box of that shape that fits', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: /^9:16 tall$/i }).click();
  await page.getByRole('button', { name: /^whole image$/i }).click();

  const sel = await selection(page);
  expect(sel.h).toBe(HEIGHT);
  expect(sel.w / sel.h).toBeCloseTo(9 / 16, 1);

  await page.getByRole('button', { name: /^free$/i }).click();
  await page.getByRole('button', { name: /^whole image$/i }).click();
  expect(await selection(page)).toEqual({ w: WIDTH, h: HEIGHT });
});

test('will not crop until something is selected', async ({ page }) => {
  const preview = await load(page);
  // Disabled rather than clickable-then-scolding: the guard inside run() that
  // would show "Drag a selection first" is defence in depth and unreachable
  // from the button, which is the better of the two behaviours.
  await expect(page.getByRole('button', { name: /^crop$/i })).toBeDisabled();

  await dragAcross(page, preview, [0.2, 0.2], [0.7, 0.7]);
  await expect(page.getByRole('button', { name: /^crop$/i })).toBeEnabled();
});
