import { expect, test } from '@playwright/test';
import { bytesOf, measure, pngOf, unzip, type Rgb } from './helpers/fixtures';

/**
 * Splitting a long capture, in a real browser.
 *
 * The unit tests prove the snapping arithmetic against a synthetic array of row
 * scores. What only a browser can prove is that the scores come from the right
 * pixels: the tool reads a narrow band around each cut rather than the whole
 * capture, and a mistake in that band offset would still produce plausible
 * cuts, just not the ones that dodge the text.
 *
 * So the fixture is built with a known rhythm of text and gaps, arranged so an
 * even division lands one cut inside a line of text and the other in a gap. The
 * assertion is that the first cut moved and the second did not.
 */

const WIDTH = 300;
const HEIGHT = 2400;
const RHYTHM = 30; //          one line of "text" every 30 rows
const INK_FROM = 20; //        rows 20..29 of each cycle are the glyphs
const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [20, 20, 20];

const isInk = (y: number) => y % RHYTHM >= INK_FROM;

/** A tall page of text-like bands with clean gaps between them. */
const capture = () =>
  pngOf(WIDTH, HEIGHT, (x, y) => (isInk(y) && x % 2 === 0 && x > 20 && x < WIDTH - 20 ? INK : WHITE));

async function load(page: import('@playwright/test').Page) {
  await page.goto('/split-a-long-screenshot');
  await page.setInputFiles('input[type="file"]', {
    name: 'thread.png',
    mimeType: 'image/png',
    buffer: capture(),
  });
  await expect(page.getByText(`thread.png, ${WIDTH} x ${HEIGHT}`)).toBeVisible();
}

async function splitAndDownload(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /^split$/i }).click();
      await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 60_000 });
      await page.getByRole('link', { name: /download/i }).click();
    })(),
  ]);
  return bytesOf(download);
}

test('moves a cut off a line of text and leaves one that is already in a gap', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^a set number$/i }).click();
  await page.locator('#split-count').fill('3');

  // An even split of 2400 into three cuts at 800 and 1600. The fixture is built
  // so that row 800 is inside a line of glyphs and row 1600 is in a gap.
  expect(isInk(800), 'the premise: 800 must land in text').toBe(true);
  expect(isInk(1600), 'the premise: 1600 must land in a gap').toBe(false);

  const pieces = unzip(await splitAndDownload(page));
  expect(pieces.map((p) => p.name)).toEqual(['thread-1.png', 'thread-2.png', 'thread-3.png']);

  const heights: number[] = [];
  for (const piece of pieces) {
    const seen = await measure(page, piece.bytes);
    expect(seen.width).toBe(WIDTH);
    heights.push(seen.height);
  }

  // Every row is accounted for exactly once: no gap, no overlap.
  expect(heights.reduce((a, b) => a + b, 0)).toBe(HEIGHT);

  // The first cut moved off the text; the second stayed where it was.
  const firstCut = heights[0]!;
  const secondCut = heights[0]! + heights[1]!;
  expect(firstCut, 'the cut on a text row should have moved').not.toBe(800);
  expect(Math.abs(firstCut - 800)).toBeLessThanOrEqual(24);
  expect(isInk(firstCut), 'the moved cut should land in a gap').toBe(false);
  expect(secondCut, 'a cut already in a gap should not move').toBe(1600);
});

test('square tiles are cut exactly, because a moved cut is not square', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^square tiles$/i }).click();

  const pieces = unzip(await splitAndDownload(page));
  // 2400 / 300 is 8 exact tiles, and no cut is allowed to drift off that.
  expect(pieces).toHaveLength(8);
  for (const piece of pieces) {
    const seen = await measure(page, piece.bytes);
    expect({ w: seen.width, h: seen.height }).toEqual({ w: WIDTH, h: WIDTH });
  }
  // Names are zero-padded so a file manager sorts them correctly.
  expect(pieces[0]!.name).toBe('thread-1.png');
});

test('screen-sized pieces are all under one screen and none is a sliver', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^screen-sized pieces$/i }).click();

  // A tall phone screen at 300 wide is 533 rows, so 2400 needs five pieces.
  const limit = Math.round((WIDTH * 16) / 9);
  const pieces = unzip(await splitAndDownload(page));
  expect(pieces).toHaveLength(Math.ceil(HEIGHT / limit));

  for (const piece of pieces) {
    const seen = await measure(page, piece.bytes);
    expect(seen.height).toBeLessThanOrEqual(limit);
    // An even division rather than slicing at a fixed height, which would end
    // with a useless strip: every piece is a real piece.
    expect(seen.height).toBeGreaterThan(limit / 2);
  }
});
