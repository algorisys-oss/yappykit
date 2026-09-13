import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Reframing a video, in a real browser.
 *
 * Window sizes and the filter graphs are unit tested in src/core/video/reframe,
 * and the graphs were checked against native ffmpeg. What is left for a browser
 * is the page's contract: the stage is the output's shape, the position control
 * drives the same `object-position` the export crops by, and the export is a
 * real MP4 of the size the page promised.
 *
 * The fixture is 320 by 240, so vertical 9:16 fills to 134 by 240 (240 x 9/16 is
 * 135, rounded down to even) and fits to 240 by 426.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/resize-video-for-reels-and-tiktok');
  await page.setInputFiles('#reframe-file', {
    name: 'clip.webm',
    mimeType: 'video/webm',
    buffer: await readFile(FIXTURE),
  });
  await expect(page.locator('[data-reframe-stage] video').last()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>('[data-reframe-stage] video:last-of-type');
    return !!v && v.videoWidth > 0;
  });
}

test('the stage is the output’s shape, and says what size the output is', async ({ page }) => {
  await load(page);
  const box = (await page.locator('[data-reframe-stage]').boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2);
  await expect(page.locator('[data-reframe-output]')).toHaveText('Output: 134 × 240');

  await page.getByRole('button', { name: /Square 1:1/ }).click();
  const square = (await page.locator('[data-reframe-stage]').boundingBox())!;
  expect(square.width / square.height).toBeCloseTo(1, 2);
  await expect(page.locator('[data-reframe-output]')).toHaveText('Output: 240 × 240');
});

test('the position control moves the picture the way the export will crop it', async ({ page }) => {
  await load(page);
  const video = page.locator('[data-reframe-stage] video').last();
  await expect(video).toHaveCSS('object-position', '50% 50%');
  await page.locator('#reframe-position').fill('0.25');
  await expect(video).toHaveCSS('object-position', '25% 50%');
});

test('show everything fits the picture over a blurred copy', async ({ page }) => {
  await load(page);
  await page.getByLabel('Show everything').check();
  await expect(page.locator('[data-reframe-stage] video')).toHaveCount(2);
  await expect(page.locator('[data-reframe-stage] video').last()).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('[data-reframe-output]')).toHaveText('Output: 240 × 426');
  await expect(page.locator('#reframe-position')).toHaveCount(0);
});

test('exports an MP4 of the promised size', async ({ page }) => {
  test.setTimeout(240_000);
  await load(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export the video' }).click();
      await expect(page.getByRole('status')).toContainText('Done: 134 × 240', { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  const out = await bytesOf(download);
  expect(download.suggestedFilename()).toBe('reframed-clip.mp4');
  expect(out.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const text = out.toString('latin1');
  expect(text).toContain('avc1');
  expect(text).toContain('mp4a');
});
