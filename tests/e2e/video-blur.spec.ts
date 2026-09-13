import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf, dragAcross } from './helpers/fixtures';

/**
 * Blurring a region of a video, in a real browser.
 *
 * The filter graph and the geometry are unit tested in src/core/video/blur.
 * What those tests cannot reach is the hop from a pointer on the screen to a
 * fraction of the frame, and that is where both bugs found while building this
 * tool lived: the pointer was measured against the surface's border box rather
 * than the video, and the drawn box was sized without its border. Each put the
 * box a few pixels away from where the user dragged, which on a privacy tool is
 * the difference between a covered face and a covered ear.
 *
 * The fixture is WebM with an Opus track on purpose. Playwright's bundled
 * Chromium has no proprietary codecs, so an MP4 might not load at all, and Opus
 * is exactly the audio that cannot be copied into an MP4 and has to be
 * re-encoded, which the export assertion checks.
 *
 * What this does NOT prove is that the pixels inside the box are unrecognisable.
 * Decoding the H.264 result needs the codecs this browser lacks. That property
 * was verified against native ffmpeg when the tool was built and is pinned by
 * the radius and power tests; this spec pins the path that gets the box there.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/blur-a-face-in-a-video');
  await page.setInputFiles('input[type="file"]', {
    name: 'clip.webm',
    mimeType: 'video/webm',
    buffer: await readFile(FIXTURE),
  });
  const video = page.locator('div.cursor-crosshair video');
  await expect(video).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>('div.cursor-crosshair video');
    return !!v && v.videoWidth > 0;
  });
  return video;
}

test('draws the box exactly where the pointer was dragged', async ({ page }) => {
  const video = await load(page);
  await dragAcross(page, video, [0.2, 0.25], [0.7, 0.8]);

  const v = (await video.boundingBox())!;
  const drawn = (await page.locator('div.cursor-crosshair > span').first().boundingBox())!;
  // Sub-pixel tolerance only: the bugs this guards against were whole pixels.
  expect(Math.abs(drawn.x - (v.x + v.width * 0.2))).toBeLessThan(0.5);
  expect(Math.abs(drawn.y - (v.y + v.height * 0.25))).toBeLessThan(0.5);
  expect(Math.abs(drawn.x + drawn.width - (v.x + v.width * 0.7))).toBeLessThan(0.5);
  expect(Math.abs(drawn.y + drawn.height - (v.y + v.height * 0.8))).toBeLessThan(0.5);

  // A new box covers the whole clip until told otherwise.
  await expect(page.getByText('Box 1', { exact: true })).toBeVisible();
  await expect(page.locator('#blur-start-0')).toHaveValue('00:00.0');
  await expect(page.locator('#blur-end-0')).toHaveValue('00:02.0');
});

test('will not export until there is something to blur', async ({ page }) => {
  await load(page);
  const exportButton = page.getByRole('button', { name: 'Export the blurred video' });
  await expect(exportButton).toBeDisabled();

  // A click that never became a drag is not a box.
  const video = page.locator('div.cursor-crosshair video');
  await dragAcross(page, video, [0.5, 0.5], [0.5005, 0.5005]);
  await expect(page.getByText(/^No boxes yet/)).toBeVisible();
  await expect(exportButton).toBeDisabled();
});

test('exports an MP4 with the video and the audio both re-encoded', async ({ page }) => {
  test.setTimeout(240_000);
  const video = await load(page);
  await dragAcross(page, video, [0.3, 0.3], [0.6, 0.7]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export the blurred video' }).click();
      await expect(page.getByRole('status')).toContainText('Done: 1 box', { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  const out = await bytesOf(download);
  expect(download.suggestedFilename()).toBe('blurred-clip.mp4');

  // MP4 box types are plain four-character headers, not compressed data, so
  // unlike the PDF text trap in redact.spec.ts a byte search is a real check.
  expect(out.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const text = out.toString('latin1');
  expect(text, 'the video was not encoded as H.264').toContain('avc1');
  expect(text, 'the Opus track was not re-encoded to AAC').toContain('mp4a');
  expect(out.length).toBeGreaterThan(10_000);
});
