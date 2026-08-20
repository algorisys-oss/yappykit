import { expect, test } from '@playwright/test';

/**
 * Camera and microphone test.
 *
 * Chromium only: the fake capture device is a Chromium launch flag, and there
 * is no cross-engine way to hand a headless browser a camera. What is being
 * proven here is our code, not the codec, so one engine is enough — and the
 * alternative (no coverage at all, because CI machines have no webcam) is
 * worse.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'needs Chromium fake devices');
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['camera', 'microphone'],
});

test('reports the real resolution and hears the microphone', async ({ page }) => {
  await page.goto('/webcam-microphone-test');
  await page.getByRole('button', { name: 'Start camera and microphone' }).click();

  // The point of the tool: facts about the device, not just a picture.
  await expect(page.getByText(/Resolution: 1280 × 720/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Frame rate: \d+ fps/)).toBeVisible();
  await expect(page.getByText('Microphone is picking up sound.')).toBeVisible({
    timeout: 15_000,
  });
  // Live preview, not a placeholder.
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBe(1280);

  // Stop must actually release the hardware, or the meeting app cannot take it.
  await page.getByRole('button', { name: 'Stop and release devices' }).click();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.srcObject)).toBeNull();
});

test('names the cause when the device is held by another application', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(Object.assign(new Error('busy'), { name: 'NotReadableError' }));
  });
  await page.goto('/webcam-microphone-test');
  await page.getByRole('button', { name: 'Start camera and microphone' }).click();
  // Not "something went wrong": the actual, actionable cause.
  await expect(page.getByRole('alert')).toContainText('Another application is using the device');
});

test('prerendered content is present without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('/webcam-microphone-test');
  await expect(p).toHaveTitle(/Webcam and Microphone Test/i);
  await expect(p.getByText(/Why is my camera showing a black screen/i)).toBeVisible();
  await ctx.close();
});
