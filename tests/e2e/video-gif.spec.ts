import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Video to GIF and animated WebP, in a real browser.
 *
 * Fitting a size is unit tested in src/core/video/animated and was checked with
 * native encodes of four real clips at five budgets. The 320 by 240, 2 s fixture
 * is too small to need shrinking under any limit the page offers, so what is
 * checked here is the page and the files the wasm engine really writes: a
 * looping GIF and an animated WebP, at the size and frame rate the page reports.
 */

const FIXTURE = new URL('./fixtures/blur-clip.webm', import.meta.url);

async function load(page: Page) {
  await page.goto('/video-to-gif');
  await page.setInputFiles('#gif-file', { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(FIXTURE) });
  await expect(page.getByText('Length: 00:02.0.')).toBeVisible({ timeout: 30_000 });
}

async function make(page: Page, button: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: button }).click();
      await expect(page.getByRole('status')).toContainText('Done:', { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) };
}

test('the range can be typed or taken from the playhead', async ({ page }) => {
  await load(page);
  await page.locator('#gif-start').fill('00:00.5');
  await page.locator('#gif-start').press('Enter');
  await expect(page.getByText('Length: 00:01.5.')).toBeVisible();

  await page.evaluate(async () => {
    const v = document.querySelector<HTMLVideoElement>('main video')!;
    v.currentTime = 1.2;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  });
  await page.getByRole('button', { name: 'Use the current time' }).nth(1).click();
  await expect(page.locator('#gif-end')).toHaveValue('00:01.2');
  await expect(page.getByText('Length: 00:00.7.')).toBeVisible();
});

test('makes a looping GIF at the size and frame rate it reports', async ({ page }) => {
  test.setTimeout(240_000);
  await load(page);
  const out = await make(page, 'Make the GIF');
  await expect(page.getByRole('status')).toContainText('320 × 240 at 15 frames a second');
  expect(out.name).toBe('clip.gif');
  expect(out.bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
  expect(out.bytes.readUInt16LE(6)).toBe(320);
  expect(out.bytes.readUInt16LE(8)).toBe(240);
  expect(out.bytes.toString('latin1'), 'loops forever').toContain('NETSCAPE2.0');
  await expect(page.getByRole('img', { name: 'The finished animation' })).toHaveJSProperty('naturalWidth', 320);
  await expect(page.getByText(/could not be brought under/)).toHaveCount(0);
});

test('makes an animated WebP', async ({ page }) => {
  test.setTimeout(240_000);
  await load(page);
  await page.getByLabel(/Animated WebP/).check();
  const out = await make(page, 'Make the WebP');
  expect(out.name).toBe('clip.webp');
  expect(out.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(out.bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  expect(out.bytes.toString('latin1'), 'an animation, not a still').toContain('ANIM');
  await expect(page.getByRole('img', { name: 'The finished animation' })).toHaveJSProperty('naturalWidth', 320);
});
