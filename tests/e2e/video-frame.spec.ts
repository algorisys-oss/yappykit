import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Saving a frame of a video, in a real browser.
 *
 * The fixture is 320 by 240 at 15 fps and changes every frame, so a step that
 * lands on the wrong frame, or skips one, shows up as the wrong frame number.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/save-a-frame-from-a-video');
  await page.setInputFiles('#frame-file', { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(FIXTURE) });
  await expect(page.getByRole('button', { name: 'Next frame' })).toBeVisible({ timeout: 30_000 });
}

const seek = (page: Page, t: number) =>
  page.evaluate(async (t) => {
    const v = document.querySelector<HTMLVideoElement>('main video')!;
    v.currentTime = t;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  }, t);

/**
 * The frame on screen, from the fixture's real frame start times. WebM stores
 * them in whole milliseconds, so frame 16 starts at 1.067, not 16/15, and a
 * formula of `floor(t * 15)` is wrong by one just before each boundary.
 */
const frameIndex = (page: Page) =>
  page.evaluate(() => {
    const t = document.querySelector<HTMLVideoElement>('main video')!.currentTime;
    let n = Math.floor(t * 15) + 1;
    while (n > 0 && Math.round((n * 1000) / 15) / 1000 > t + 1e-9) n--;
    return n;
  });

test('steps exactly one frame at a time, forwards and back', async ({ page }) => {
  await load(page);
  await seek(page, 1.0);
  expect(await frameIndex(page)).toBe(15);
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: 'Next frame' }).click();
    await expect(page.getByRole('button', { name: 'Next frame' })).toBeEnabled();
    expect(await frameIndex(page), `after ${i} steps forward`).toBe(15 + i);
  }
  for (let i = 1; i <= 5; i++) {
    await page.getByRole('button', { name: 'Previous frame' }).click();
    await expect(page.getByRole('button', { name: 'Previous frame' })).toBeEnabled();
    expect(await frameIndex(page), `after ${i} steps back`).toBe(20 - i);
  }
});

test('saves the frame as a full-size PNG named after its moment, and as JPEG', async ({ page }) => {
  await load(page);
  await seek(page, 1.0);
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.getByRole('button', { name: 'Next frame' })).toBeEnabled();

  await page.getByRole('button', { name: 'Save this frame' }).click();
  await expect(page.getByRole('status')).toContainText('320 × 240');
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).first().click()]);
  const pngBytes = await bytesOf(png);
  expect(png.suggestedFilename()).toMatch(/^clip-00m01\.0\d\ds\.png$/);
  expect(pngBytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(pngBytes.readUInt32BE(16)).toBe(320);
  expect(pngBytes.readUInt32BE(20)).toBe(240);

  await page.getByLabel(/^JPEG/).check();
  await page.getByRole('button', { name: 'Save this frame' }).click();
  await expect(page.getByRole('heading', { name: 'Saved frames (2)' })).toBeVisible();
  const [jpg] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).first().click()]);
  const jpgBytes = await bytesOf(jpg);
  expect(jpg.suggestedFilename()).toMatch(/\.jpg$/);
  expect(jpgBytes[0]).toBe(0xff);
  expect(jpgBytes[1]).toBe(0xd8);
  expect(jpgBytes.length).toBeLessThan(pngBytes.length);
});

test('says plainly when the browser cannot play the file', async ({ page }) => {
  await page.goto('/save-a-frame-from-a-video');
  await page.setInputFiles('#frame-file', { name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video at all') });
  await expect(page.getByRole('alert')).toContainText('can’t play this video', { timeout: 15_000 });
});
