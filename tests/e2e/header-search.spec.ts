import { expect, test } from '@playwright/test';

/**
 * Clicking a search result must open that tool.
 *
 * The regression this guards against only appears with a real mouse. The input
 * closed its dropdown 150ms after losing focus, and a physical click holds the
 * button down long enough for that timer to fire: mousedown blurred the input,
 * the list unmounted mid-click, and mouseup landed on nothing. A synthetic
 * click never reproduced it because Playwright presses and releases in the same
 * millisecond, which is why the first version of this suite passed while the
 * live site was broken.
 *
 * So this test holds the button down.
 */
test('a slow mouse click on a result opens the tool', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').fill('pictionary');

  const option = page.locator('li[role="option"] a').first();
  await expect(option).toBeVisible();

  const box = await option.boundingBox();
  if (!box) throw new Error('the result has no box to click');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Longer than the dropdown's close delay: this is an ordinary human click.
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(page).toHaveURL(/\/random-word-generator$/);
});

test('keyboard selection still opens the tool', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox').fill('pictionary');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/random-word-generator$/);
});

test('a modified click is left to the browser, so results still open in a new tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('combobox').fill('pictionary');
  const option = page.locator('li[role="option"] a').first();
  await expect(option).toBeVisible();

  const opened = context.waitForEvent('page', { timeout: 5000 });
  await option.click({ modifiers: ['ControlOrMeta'] });
  const tab = await opened;
  await expect(tab).toHaveURL(/\/random-word-generator$/);
  // The original page must not have navigated as well.
  await expect(page).toHaveURL(/\/$/);
});
