import { expect, test, type Page } from '@playwright/test';

/**
 * The world clock, in a real browser.
 *
 * The core tests own the arithmetic. What is left is wiring that only exists in
 * a running page: that home really comes from the device's zone, that one
 * planned instant reaches every row, and that a list survives a reload and
 * travels in a share link. The zone and the clock are pinned so the expected
 * readings are facts, not whatever time the suite happens to run.
 */

test.use({ timezoneId: 'Asia/Kolkata', locale: 'en-US' });

// 08:00 UTC on 1 July 2026: 13:30 in India, 04:00 in New York (EDT).
const NOW = new Date('2026-07-01T08:00:00Z');

const search = (page: Page) => page.getByRole('combobox', { name: 'City, country or time zone' });
const rows = (page: Page) => page.locator('li[data-zone]');
const clockIn = (page: Page, zone: string) => page.locator(`li[data-zone="${zone}"] [data-clock]`);

async function addClock(page: Page, query: string) {
  await search(page).fill(query);
  await search(page).press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('starts at home, from the device zone, with nothing else on the list', async ({ page }) => {
  await page.goto('/world-clock');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute('data-zone', 'Asia/Kolkata');
  await expect(rows(page).first()).toContainText('New Delhi');
  await expect(rows(page).first()).toContainText('Home');
  await expect(clockIn(page, 'Asia/Kolkata')).toHaveText('1:30 PM');
});

test('adds clocks by country and abbreviation, once each', async ({ page }) => {
  await page.goto('/world-clock');
  await addClock(page, 'usa');
  await addClock(page, 'pst');
  await addClock(page, 'india');

  await expect(rows(page)).toHaveCount(3);
  await expect(clockIn(page, 'America/New_York')).toHaveText('4:00 AM');
  await expect(rows(page).nth(1)).toContainText('−9:30 h from home');
  await expect(clockIn(page, 'America/Los_Angeles')).toHaveText('1:00 AM');
  await expect(page.getByRole('status').filter({ hasText: 'already on your list' })).toBeVisible();
});

test('planning an hour moves every clock to the same instant', async ({ page }) => {
  await page.goto('/world-clock');
  await addClock(page, 'new york');

  // 19:00 in the home day, picked from the New York row's strip.
  await page.locator('li[data-zone="America/New_York"] button[aria-pressed]').nth(19).click();
  await expect(clockIn(page, 'Asia/Kolkata')).toHaveText('7:00 PM');
  await expect(clockIn(page, 'America/New_York')).toHaveText('9:30 AM');
  await expect(page.getByRole('status').filter({ hasText: 'Planning a time' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to now' }).click();
  await expect(clockIn(page, 'America/New_York')).toHaveText('4:00 AM');
});

test('remembers the list and the new home across a reload', async ({ page }) => {
  await page.goto('/world-clock');
  await addClock(page, 'london');
  await page.locator('li[data-zone="Europe/London"]').getByRole('button', { name: 'Make home' }).click();
  await page.reload();

  await expect(rows(page).first()).toHaveAttribute('data-zone', 'Europe/London');
  await expect(rows(page).nth(1)).toHaveAttribute('data-zone', 'Asia/Kolkata');
  await expect(rows(page).nth(1)).toContainText('+4:30 h from home');
});

test('a share link adds its places to the visitor’s own, keeping their home first', async ({ page }) => {
  await page.goto('/world-clock#zones=America%2FNew_York,bogus,Asia%2FCalcutta,Asia%2FTokyo');

  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).first()).toHaveAttribute('data-zone', 'Asia/Kolkata');
  await expect(page.getByRole('status').filter({ hasText: 'from the link you opened: 2' })).toBeVisible();
  // Cleared, so a reload does not add them again.
  expect(new URL(page.url()).hash).toBe('');
});

test('fits a phone screen without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/world-clock');
  await addClock(page, 'new york');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
