import { expect, test, type Page } from '@playwright/test';

/**
 * The stream timer, in a real browser.
 *
 * The core module's own tests cover the arithmetic, and they cannot cover any
 * of this. What is left is everything that only exists once the page is running:
 * whether the clock the audience sees agrees with the length the streamer set at
 * the instant they press start, and whether a break survives the page being
 * reloaded in the middle of it. Both are claims about wiring rather than about
 * maths, so a browser is the only place they can be checked.
 */

const RUN_KEY = 'yappykit-stream-timer-run';
const CLOCK = /^\d{1,2}:\d{2}$/;

/** The big clock in the preview, found the way a viewer finds it: it is the time. */
const clockOf = (page: Page) => page.locator('main p').filter({ hasText: CLOCK }).first();

/**
 * The phase, read off the status line rather than off the page. The article
 * below the tool discusses counting down at length, so plain text matching
 * finds the prose as readily as the state.
 */
const statusOf = (page: Page) =>
  page.getByRole('status').filter({ hasText: /^(Ready|Counting down|Paused|Finished)$/ });

async function setLength(page: Page, minutes: number, seconds: number) {
  await page.getByLabel('Minutes').fill(String(minutes));
  await page.getByLabel('Seconds').fill(String(seconds));
}

const toSeconds = (clock: string) => {
  const parts = clock.split(':').map(Number);
  return parts.length === 3
    ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
    : parts[0]! * 60 + parts[1]!;
};

test('starts at exactly the length it was set to', async ({ page }) => {
  await page.goto('/stream-countdown-timer');
  await setLength(page, 0, 20);
  await expect(clockOf(page)).toHaveText('0:20');

  // Sample every frame across the press. The clock is derived from a signal on
  // an interval, so a reading taken from a stale one shows a second that was
  // never on the timer: a countdown that starts by counting UP is the one thing
  // an audience is guaranteed to notice.
  const sampling = page.evaluate(async () => {
    const el = [...document.querySelectorAll('main p')]
      .find((p) => /^\d{1,2}:\d{2}$/.test(p.textContent ?? ''));
    const seen = new Set<string>();
    const until = performance.now() + 800;
    while (performance.now() < until) {
      seen.add(el?.textContent ?? '');
      await new Promise((r) => requestAnimationFrame(r));
    }
    return [...seen];
  });

  await page.getByRole('button', { name: 'Start' }).click();
  const seen = await sampling;

  expect(seen).toContain('0:20');
  expect(Math.max(...seen.map(toSeconds))).toBe(20);
});

test('picks a running countdown back up after a reload', async ({ page }) => {
  await page.goto('/stream-countdown-timer');
  await setLength(page, 1, 0);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(statusOf(page)).toHaveText('Counting down');

  await page.waitForTimeout(2500);
  const before = toSeconds(await clockOf(page).innerText());
  await page.reload();

  // Still counting, and counting from where it actually is rather than from the
  // top: a break does not restart because the streamer refreshed the page.
  await expect(statusOf(page)).toHaveText('Counting down');
  const after = toSeconds(await clockOf(page).innerText());
  expect(after).toBeLessThanOrEqual(before);
  expect(after).toBeGreaterThan(50);
});

test('comes back finished if it ran out while the page was away', async ({ page }) => {
  await page.goto('/stream-countdown-timer');
  await setLength(page, 0, 5);
  await page.getByRole('button', { name: 'Start' }).click();

  await page.waitForTimeout(6000);
  await page.reload();

  await expect(statusOf(page)).toHaveText('Finished');
  await expect(clockOf(page)).toHaveText('0:00');
});

test('forgets a run that finished long ago rather than greeting you with it', async ({ page }) => {
  await page.goto('/stream-countdown-timer');
  await setLength(page, 0, 5);

  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({
      countdown: { phase: 'running', durationMs: 5000, endsAt: Date.now() - 3_600_000, remainingMs: 5000 },
      savedAt: Date.now() - 3_600_000,
    }));
  }, RUN_KEY);
  await page.reload();

  await expect(statusOf(page)).toHaveText('Ready');
  await expect(clockOf(page)).toHaveText('0:05');
});

test('a reset is not undone by a reload', async ({ page }) => {
  await page.goto('/stream-countdown-timer');
  await setLength(page, 0, 30);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(statusOf(page)).toHaveText('Counting down');

  await page.getByRole('button', { name: 'Reset' }).click();
  await page.reload();

  await expect(statusOf(page)).toHaveText('Ready');
  await expect(clockOf(page)).toHaveText('0:30');
});
