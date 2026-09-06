import { expect, test } from '@playwright/test';

/**
 * The on-screen ruler, in a real browser.
 *
 * Everything here is a claim about the physical world, which is exactly what
 * makes it worth a browser test. A screen has no fixed physical size, so the
 * scale is a guess until someone calibrates it against a bank card, and the
 * tool is honest about which of the two states it is in.
 *
 * The other claim is that the calibration is remembered on the device. That is
 * localStorage, and a spec is the only thing that will notice it silently
 * failing to persist across a reload.
 */

const CALIBRATION = /Calibrated: \d+(\.\d+)? pixels per inch/;

test('says plainly that it is guessing until it is calibrated', async ({ page }) => {
  await page.goto('/online-ruler');
  // Not "approximately": the tool states the measurements are an estimate.
  await expect(page.getByText(/not calibrated yet, measurements below are an estimate/i)).toBeVisible();
  await expect(page.getByText(/every card in the world is the same size/i)).toBeVisible();
});

test('calibrating changes the scale and reports the resulting resolution', async ({ page }) => {
  await page.goto('/online-ruler');
  const card = page.locator('#card-width');
  await expect(card).toBeVisible();

  const before = await page.getByText(/Ruler length: [\d.]+ cm/).innerText();

  // Widen the card outline, which is what changes pixels-per-inch, then commit.
  await card.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: /^save calibration$/i }).click();

  await expect(page.getByText(CALIBRATION)).toBeVisible();
  // A different scale means a different number of centimetres fit on screen.
  await expect(page.getByText(/Ruler length: [\d.]+ cm/)).not.toHaveText(before);
  // And it stops describing itself as a guess.
  await expect(page.getByText(/not calibrated yet/i)).toBeHidden();
});

test('the calibration survives a reload, because it belongs to the device', async ({ page }) => {
  await page.goto('/online-ruler');
  const card = page.locator('#card-width');
  await card.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: /^save calibration$/i }).click();

  const saved = await page.getByText(CALIBRATION).innerText();

  await page.reload();
  // The measurement is only worth anything if it is the same one next time.
  await expect(page.getByText(CALIBRATION)).toHaveText(saved);
  await expect(page.getByText(/not calibrated yet/i)).toBeHidden();
});

test('switches between centimetres and inches', async ({ page }) => {
  await page.goto('/online-ruler');
  await page.getByRole('radio', { name: /^inches$/i }).click();
  await expect(page.getByText(/Ruler length: [\d.]+ cm \/ [\d.]+ in/)).toBeVisible();

  await page.getByRole('radio', { name: /^centimetres$/i }).click();
  await expect(page.getByText(/Ruler length: [\d.]+ cm/)).toBeVisible();
});

test('turns vertical for measuring the other way', async ({ page }) => {
  await page.goto('/online-ruler');
  await page.getByRole('radio', { name: /^vertical$/i }).click();
  await expect(page.getByRole('radio', { name: /^vertical$/i })).toBeChecked();
});
