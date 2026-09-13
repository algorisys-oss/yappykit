import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Changing a video's speed, in a real browser.
 *
 * Splitting parts, fitting a length and the filter graph are unit tested in
 * src/core/video/speed, and the graph was checked against native ffmpeg for
 * output length, frame timing and pitch. What a browser adds is the page: the
 * speed buttons act on the selection, the preview plays at the part's speed, and
 * the export is an MP4 as long as the page said it would be.
 *
 * The fixture lasts 2.008 s. Its length in the export is read from the MP4's own
 * movie header, because Chromium builds used for testing cannot play H.264.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/speed-up-a-video');
  await page.setInputFiles('#speed-file', {
    name: 'clip.webm',
    mimeType: 'video/webm',
    buffer: await readFile(FIXTURE),
  });
  await expect(page.getByText('Output: 00:02.0, from 00:02.0.')).toBeVisible({ timeout: 30_000 });
}

/** Duration in seconds from the `mvhd` box. */
function mp4Duration(bytes: Buffer): number {
  const at = bytes.indexOf('mvhd', 0, 'latin1');
  expect(at, 'the MP4 should have a movie header').toBeGreaterThan(0);
  const version = bytes[at + 4];
  return version === 1
    ? Number(bytes.readBigUInt64BE(at + 32)) / bytes.readUInt32BE(at + 28)
    : bytes.readUInt32BE(at + 20) / bytes.readUInt32BE(at + 16);
}

async function exportIt(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export the video' }).click();
      await expect(page.getByRole('status')).toContainText('Done:', { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) };
}

test('the speed buttons change the whole video until a part is selected', async ({ page }) => {
  await load(page);
  await expect(page.locator('#speed-buttons-label')).toHaveText('Speed for the whole video');
  await page.getByRole('button', { name: '2×', exact: true }).click();
  await expect(page.getByText('Output: 00:01.0, from 00:02.0.')).toBeVisible();
  await expect(page.getByRole('button', { name: '2×', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#speed-start').fill('00:00.5');
  await page.locator('#speed-start').press('Enter');
  await page.locator('#speed-end').fill('00:01.5');
  await page.locator('#speed-end').press('Enter');
  await expect(page.locator('#speed-buttons-label')).toHaveText('Speed for the selected part');
  await page.getByRole('button', { name: '1×', exact: true }).click();
  // 0.25 s at 2x, 1 s at 1x, 0.254 s at 2x.
  await expect(page.getByText(/Output: 00:01\.5, from 00:02\.0\. 3 parts at different speeds\./)).toBeVisible();
});

test('make it last solves the speed for a length, and says when it cannot get there', async ({ page }) => {
  await load(page);
  await page.locator('#speed-fit').fill('0:04');
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect(page.getByText('Set to 0.5× for the whole video.')).toBeVisible();
  await expect(page.getByText('Output: 00:04.0, from 00:02.0.')).toBeVisible();

  await page.locator('#speed-fit').fill('0:30');
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect(page.getByText(/outside 0\.25× to 16×, so it is set to 0\.25× and will last 00:08\.0/)).toBeVisible();
});

test('the preview plays each part at its own speed', async ({ page }) => {
  await load(page);
  await page.locator('#speed-end').fill('00:01.0');
  await page.locator('#speed-end').press('Enter');
  await page.getByRole('button', { name: '4×', exact: true }).click();
  const rateAt = (t: number) =>
    page.evaluate(async (t) => {
      const v = document.querySelector<HTMLVideoElement>('main video')!;
      v.muted = true;
      v.pause();
      v.currentTime = t;
      await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
      await v.play();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rate = v.playbackRate;
      v.pause();
      return rate;
    }, t);
  expect(await rateAt(0.2)).toBe(4);
  expect(await rateAt(1.5)).toBe(1);
});

test('exports an MP4 as long as the page said', async ({ page }) => {
  test.setTimeout(240_000);
  await load(page);
  await page.locator('#speed-start').fill('00:00.5');
  await page.locator('#speed-start').press('Enter');
  await page.locator('#speed-end').fill('00:01.5');
  await page.locator('#speed-end').press('Enter');
  await page.getByRole('button', { name: '4×', exact: true }).click();
  // 0.5 s + 1 s at 4x + 0.508 s.
  await expect(page.getByText(/Output: 00:01\.3, from 00:02\.0\./)).toBeVisible();

  const out = await exportIt(page);
  expect(out.name).toBe('clip-speed.mp4');
  expect(out.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const text = out.bytes.toString('latin1');
  expect(text).toContain('avc1');
  expect(text).toContain('mp4a');
  expect(mp4Duration(out.bytes)).toBeGreaterThan(1.15);
  expect(mp4Duration(out.bytes)).toBeLessThan(1.36);
});
