import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Splitting and joining videos, in a real browser.
 *
 * Part ranges and the join graph are unit tested in src/core/video/split-join,
 * and the join was checked natively with three mismatched clips: 12.000 s of
 * picture and sound from 5 + 3 + 4, the second clip's beep landing 8.000 s after
 * the first's, and black bars around a portrait clip. Here: the pages, and MP4s
 * whose length is read from their own movie header, because Chromium builds used
 * for testing cannot play H.264.
 *
 * Fixtures: blur-clip is 320 by 240, 15 fps, 2.008 s with Opus sound;
 * silent-clip is 160 by 120, 10 fps, 1 s with no sound.
 */

const CLIP = new URL('./fixtures/blur-clip.webm', import.meta.url);
const SILENT = new URL('./fixtures/silent-clip.webm', import.meta.url);

function mp4Duration(bytes: Buffer): number {
  const at = bytes.indexOf('mvhd', 0, 'latin1');
  expect(at, 'the MP4 should have a movie header').toBeGreaterThan(0);
  return bytes[at + 4] === 1
    ? Number(bytes.readBigUInt64BE(at + 32)) / bytes.readUInt32BE(at + 28)
    : bytes.readUInt32BE(at + 20) / bytes.readUInt32BE(at + 16);
}

async function download(page: Page, link: ReturnType<Page['getByRole']>) {
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { name: d.suggestedFilename(), bytes: await bytesOf(d) };
}

test('split says when a limit would leave one part, and cuts equal parts', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/split-a-video');
  await page.setInputFiles('#split-file', { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(CLIP) });
  await expect(page.locator('[data-split-plan]')).toContainText('single part', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Split the video' })).toBeDisabled();

  await page.locator('#split-count').fill('2');
  await page.getByLabel('Equal parts').first().check();
  await expect(page.locator('[data-split-plan]')).toHaveText('2 parts: 00:01.0, 00:01.0');
  await page.getByRole('button', { name: 'Split the video' }).click();
  await expect(page.getByRole('status')).toContainText('Done: 2 parts.', { timeout: 200_000 });

  const zip = await download(page, page.getByRole('link', { name: 'Download all as ZIP' }));
  expect(zip.name).toBe('clip-parts.zip');
  expect(zip.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(zip.bytes.toString('latin1')).toContain('clip-part-1-of-2.mp4');

  const second = await download(page, page.getByRole('link', { name: 'Download', exact: true }).nth(1));
  expect(second.name).toBe('clip-part-2-of-2.mp4');
  expect(mp4Duration(second.bytes)).toBeGreaterThan(0.9);
  expect(mp4Duration(second.bytes)).toBeLessThan(1.15);
});

test('join puts clips in order, fits them to the first, and exports their combined length', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/join-videos');
  await page.setInputFiles('#join-files', [
    { name: 'silent.webm', mimeType: 'video/webm', buffer: await readFile(SILENT) },
    { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(CLIP) },
  ]);
  await expect(page.locator('[data-join-clip]')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('[data-join-output]')).toHaveText('Output: 160 × 120, 00:03.0 long.');

  await page.getByRole('button', { name: 'Move clip.webm up' }).click();
  await expect(page.locator('[data-join-clip]').first()).toContainText('clip.webm');
  await expect(page.locator('[data-join-output]')).toHaveText('Output: 320 × 240, 00:03.0 long.');

  await page.getByRole('button', { name: 'Join the videos' }).click();
  await expect(page.getByRole('status')).toContainText('Done:', { timeout: 200_000 });
  const out = await download(page, page.getByRole('link', { name: /^Download / }));
  expect(out.name).toBe('joined.mp4');
  const text = out.bytes.toString('latin1');
  expect(text).toContain('avc1');
  expect(text, 'the silent clip gets silence, so the file keeps one sound track').toContain('mp4a');
  expect(mp4Duration(out.bytes)).toBeGreaterThan(2.9);
  expect(mp4Duration(out.bytes)).toBeLessThan(3.2);
});

test('join refuses to start with a single clip', async ({ page }) => {
  await page.goto('/join-videos');
  await page.setInputFiles('#join-files', { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(CLIP) });
  await expect(page.getByText('Add at least one more video to join.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Join the videos' })).toBeDisabled();
});
