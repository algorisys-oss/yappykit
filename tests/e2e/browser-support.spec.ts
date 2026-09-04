import { expect, test } from '@playwright/test';

/**
 * The per-tool browser table.
 *
 * Two things worth proving. That it is in the HTML a crawler reads rather than
 * only in the rendered app, and that it differs per tool: a table that says the
 * same thing on every page is decoration, not information.
 */

test('the table is prerendered, not painted on by the app', async ({ request }) => {
  const html = await (await request.get('/compress-video-to-size')).text();
  expect(html).toContain('Browser support');
  // ffmpeg needs DecompressionStream, which reached Firefox at 113.
  expect(html).toMatch(/Firefox[\s\S]{0,200}?113 and later/);
});

test('a tool that needs more asks for more', async ({ page }) => {
  await page.goto('/compress-video-to-size');
  const video = page.locator('li', { hasText: 'Firefox' }).last();
  await expect(video).toContainText('113 and later');

  // The watermarker needs nothing beyond the build target, so it stays there.
  await page.goto('/add-watermark-to-image');
  const mark = page.locator('li', { hasText: 'Firefox' }).last();
  await expect(mark).toContainText('93 and later');
});

test('a Chromium-only fast path is shown as slower, not as broken', async ({ page }) => {
  // Local Font Access never shipped outside Chromium, but the font tools work
  // everywhere by asking for a file instead.
  await page.goto('/font-character-checker');
  await expect(page.locator('li', { hasText: 'Safari' }).last()).toContainText('slower path');
  await expect(page.locator('li', { hasText: 'Chrome' }).last()).not.toContainText('slower path');
});

test('it reaches a verdict on the browser actually reading the page', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  // Chromium has everything the watermarker prefers.
  await expect(page.getByText('Your browser has everything this tool needs.')).toBeVisible();

  await page.goto('/font-character-checker');
  const verdicts = [
    'Your browser has everything this tool needs.',
    'Your browser can run this tool, but on a slower path.',
  ];
  await expect(
    page.getByText(new RegExp(verdicts.map((v) => v.replace(/[.]/g, '\\.')).join('|'))),
  ).toBeVisible();
});

test('it says when the numbers were last checked', async ({ page }) => {
  await page.goto('/merge-pdf');
  await expect(page.getByText(/Version numbers checked on \d{4}-\d{2}-\d{2}\./)).toBeVisible();
});
