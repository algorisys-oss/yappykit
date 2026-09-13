import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bytesOf } from './helpers/fixtures';

/**
 * Muting a video and extracting its audio, in a real browser.
 *
 * The argument builders are unit tested in src/core/video/audio, and the
 * outputs were checked against native ffmpeg when these were built: muted video
 * packets are identical to the source's, and AAC copied into M4A is identical
 * packet for packet. What these check is the page and the file it hands back,
 * by the file's own headers: Matroska names its codecs in plain ASCII, an MP3
 * written by ffmpeg starts with an ID3 tag, an M4A with an ftyp box, and a WAV
 * with RIFF and WAVE.
 */

const CLIP = new URL('./fixtures/blur-clip.webm', import.meta.url);
const SILENT = new URL('./fixtures/silent-clip.webm', import.meta.url);

async function pick(page: Page, input: string, fixture: URL) {
  await page.setInputFiles(input, { name: 'clip.webm', mimeType: 'video/webm', buffer: await readFile(fixture) });
}

async function runAndDownload(page: Page, button: string, done: RegExp) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: button }).click();
      await expect(page.getByRole('status')).toContainText(done, { timeout: 200_000 });
      await page.getByRole('link', { name: /^Download / }).click();
    })(),
  ]);
  return { name: download.suggestedFilename(), bytes: await bytesOf(download) };
}

test('muting keeps the picture and removes the sound, in the same container', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/mute-a-video');
  await pick(page, '#mute-file', CLIP);
  const out = await runAndDownload(page, 'Remove the sound', /^Done:/);
  expect(out.name).toBe('clip-muted.webm');
  const text = out.bytes.toString('latin1');
  expect(out.bytes.readUInt32BE(0)).toBe(0x1a45dfa3);
  expect(text, 'the picture should still be there').toContain('V_VP9');
  expect(text, 'the Opus track should be gone').not.toContain('A_OPUS');
});

for (const [format, check] of [
  ['MP3', (b: Buffer) => expect(b.subarray(0, 3).toString('latin1')).toBe('ID3')],
  ['M4A', (b: Buffer) => {
    expect(b.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(b.toString('latin1')).toContain('mp4a');
  }],
  ['WAV', (b: Buffer) => {
    expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(b.subarray(8, 12).toString('latin1')).toBe('WAVE');
  }],
] as const) {
  test(`extracts the soundtrack as ${format}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/extract-audio-from-video');
    await pick(page, '#extract-file', CLIP);
    await page.getByLabel(format, { exact: false }).first().check();
    const out = await runAndDownload(page, 'Extract the audio', new RegExp(`Done: ${format}`));
    expect(out.name).toBe(`clip.${format.toLowerCase()}`);
    check(out.bytes);
  });
}

test('says so plainly when a video has no sound to extract', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/extract-audio-from-video');
  await pick(page, '#extract-file', SILENT);
  await page.getByRole('button', { name: 'Extract the audio' }).click();
  await expect(page.getByText('This video has no sound to extract.')).toBeVisible({ timeout: 200_000 });
});
