import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf, dragAcross } from './helpers/fixtures';

/**
 * Annotating a video, in a real browser.
 *
 * The geometry and the filter graph are unit tested in src/core/video/annotate.
 * These check what only a browser can: that a drag becomes a shape in the right
 * place, that the preview shows an annotation only during its span, and that
 * the export is a real MP4. The preview is read back from its canvas pixels,
 * because the preview and the export are painted by the same function, so a
 * shape in the right place on the canvas is a shape in the right place in the
 * file.
 *
 * Pixels inside the exported H.264 cannot be read here, since Playwright's
 * Chromium has no H.264 decoder; that was verified with native ffmpeg when the
 * tool was built.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/add-text-and-arrows-to-a-video');
  await page.setInputFiles('#annotate-file', {
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

/** One pixel of the preview canvas, in the video's own coordinates. */
function pixel(page: Page, fx: number, fy: number) {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-annotation-preview]')!;
      const d = c.getContext('2d')!.getImageData(Math.round(x! * c.width), Math.round(y! * c.height), 1, 1).data;
      return { r: d[0]!, g: d[1]!, b: d[2]!, a: d[3]! };
    },
    [fx, fy],
  );
}

const isYellow = (p: { r: number; g: number; b: number; a: number }) =>
  p.a > 200 && p.r > 200 && p.g > 170 && p.b < 90;

test('draws a box where the pointer was dragged, and only its outline', async ({ page }) => {
  const video = await load(page);
  await page.getByLabel('Box').check();
  await dragAcross(page, video, [0.2, 0.25], [0.7, 0.8]);

  await expect(page.getByText('Box 1', { exact: true })).toBeVisible();
  // On the left edge of the box, halfway down: the stroke is yellow.
  expect(isYellow(await pixel(page, 0.2, 0.5))).toBe(true);
  // Inside the box: nothing painted, the video shows through.
  expect((await pixel(page, 0.45, 0.5)).a).toBe(0);
  // Well outside the box: nothing painted either.
  expect((await pixel(page, 0.05, 0.05)).a).toBe(0);
});

test('shows an annotation in the preview only during its span', async ({ page }) => {
  const video = await load(page);
  await page.getByLabel('Box').check();
  await dragAcross(page, video, [0.2, 0.25], [0.7, 0.8]);
  await page.locator('#annotate-start-0').fill('00:01.0');
  await page.locator('#annotate-start-0').press('Tab');

  const scrub = page.getByLabel('Position in the video');
  await scrub.fill('0.3');
  await expect.poll(async () => (await pixel(page, 0.2, 0.5)).a).toBe(0);
  await scrub.fill('1.5');
  await expect.poll(async () => isYellow(await pixel(page, 0.2, 0.5))).toBe(true);
});

test('a click places text, ready to be typed over', async ({ page }) => {
  const video = await load(page);
  await page.getByLabel('Text', { exact: true }).first().check();
  await dragAcross(page, video, [0.5, 0.5], [0.5, 0.5]);
  const input = page.locator('#annotate-text-0');
  await expect(input).toHaveValue('Your text');
  await input.fill('Hello');
  // The text is centred on the click, so its middle is painted.
  await expect.poll(async () => (await pixel(page, 0.5, 0.5)).a).toBeGreaterThan(0);
});

test('exports an MP4 with the video and the audio both re-encoded', async ({ page }) => {
  test.setTimeout(240_000);
  const video = await load(page);
  await page.getByLabel('Arrow').check();
  await dragAcross(page, video, [0.1, 0.9], [0.6, 0.3]);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export the video' }).click();
      await expect(page.getByRole('status')).toContainText('Done: 1 annotation', { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  const out = await bytesOf(download);
  expect(download.suggestedFilename()).toBe('annotated-clip.mp4');
  expect(out.subarray(4, 8).toString('latin1')).toBe('ftyp');
  const text = out.toString('latin1');
  expect(text, 'the video was not encoded as H.264').toContain('avc1');
  expect(text, 'the Opus track was not re-encoded to AAC').toContain('mp4a');
});
