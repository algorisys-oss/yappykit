import { expect, test } from '@playwright/test';
import { pngOf, type Rgb } from './helpers/fixtures';

/**
 * The colour picker, in a real browser.
 *
 * Two claims need a browser. The first is that pointing at a pixel returns that
 * pixel: the read has to happen with smoothing off, and with it left on the
 * browser hands back a blend with the neighbours, which is a colour that looks
 * right, is wrong, and never matches when pasted. Only a real canvas shows the
 * difference.
 *
 * The second is that the palette shares describe the picture. The fixture is
 * built as exactly 60/25/15 of three flat colours, so a tool reporting the
 * population of its own median-cut boxes, which are equal by construction,
 * cannot pass.
 */

const WIDTH = 200;
const HEIGHT = 400;
const BLUE: Rgb = [28, 78, 216]; //   60%: rows 0..239
const YELLOW: Rgb = [234, 179, 8]; // 25%: rows 240..339
const NEAR_BLACK: Rgb = [17, 17, 17]; // 15%: rows 340..399

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

const brand = () =>
  pngOf(WIDTH, HEIGHT, (_x, y) => (y < 240 ? BLUE : y < 340 ? YELLOW : NEAR_BLACK));

async function load(page: import('@playwright/test').Page) {
  await page.goto('/color-picker-from-image');
  await page.setInputFiles('input[type="file"]', {
    name: 'brand.png',
    mimeType: 'image/png',
    buffer: brand(),
  });
  await expect(page.getByText(`brand.png, ${WIDTH} x ${HEIGHT}`)).toBeVisible();
  return page.locator('img[alt="brand.png"]').first();
}

/** Click a point on the preview given as a fraction of its own box. */
async function pointAt(
  page: import('@playwright/test').Page,
  preview: import('@playwright/test').Locator,
  fy: number,
) {
  await preview.scrollIntoViewIfNeeded();
  const box = (await preview.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * fy);
}

test('the palette is the colours of the image, in the proportions they cover', async ({ page }) => {
  await load(page);

  const swatches = page.locator('li button');
  await expect(swatches).toHaveCount(3, { timeout: 30_000 });

  // Three colours exist, so three swatches, even though six were asked for:
  // fewer swatches rather than duplicates.
  const labels = await swatches.allInnerTexts();
  const flat = labels.join(' ');
  expect(flat).toContain(hex(BLUE));
  expect(flat).toContain(hex(YELLOW));
  expect(flat).toContain(hex(NEAR_BLACK));

  // Ordered by how much of the image each covers, widest first.
  expect(labels[0]).toContain(hex(BLUE));
  expect(labels[0]).toContain('60%');
  expect(labels[1]).toContain('25%');
  expect(labels[2]).toContain('15%');
});

test('points at the exact pixel rather than a blend with its neighbours', async ({ page }) => {
  const preview = await load(page);

  await pointAt(page, preview, 0.72); // inside the yellow band
  await expect(page.getByRole('button', { name: `rgb(${YELLOW.join(', ')})` })).toBeVisible();
  await expect(page.getByRole('button', { name: hex(YELLOW), exact: true })).toBeVisible();

  await pointAt(page, preview, 0.95); // inside the near-black band
  await expect(page.getByRole('button', { name: `rgb(${NEAR_BLACK.join(', ')})` })).toBeVisible();
});

test('reports the contrast that decides whether text will read on the colour', async ({ page }) => {
  const preview = await load(page);
  await pointAt(page, preview, 0.95); // near-black

  // #111111 on white is 18.88:1 by the WCAG formula, which is AAA either way.
  await expect(page.getByText(/18\.\d+:1 · AAA/)).toBeVisible();

  await pointAt(page, preview, 0.72); // yellow, which fails behind body text
  await expect(page.getByText(/1\.9\d:1 · too low for text/)).toBeVisible();
});
