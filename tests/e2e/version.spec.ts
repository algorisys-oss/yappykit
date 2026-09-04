import { expect, test } from '@playwright/test';

/**
 * The version in the footer, and what is behind it.
 *
 * The number has to survive without JavaScript, because it is how you tell
 * which build a page came from when something is wrong with it. The panel is
 * interactive and does not.
 */

test('the version is in the served HTML, not painted on by the app', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toMatch(/v\d+\.\d+\.\d+/);
});

test('it appears on a tool page too, not only the home page', async ({ page }) => {
  await page.goto('/add-watermark-to-image');
  await expect(page.getByRole('button', { name: /^v\d+\.\d+\.\d+$/ })).toBeVisible();
});

test('clicking it shows what changed, and closes again', async ({ page }) => {
  await page.goto('/');
  const badge = page.getByRole('button', { name: /^v\d+\.\d+\.\d+$/ });
  await expect(badge).toHaveAttribute('aria-expanded', 'false');

  await badge.click();
  await expect(badge).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator('#version-notes');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Added', { exact: true })).toBeVisible();
  await expect(panel.getByText('Fixed', { exact: true })).toBeVisible();
  await expect(panel).toContainText('Watermark tool');

  await badge.click();
  await expect(panel).toBeHidden();
});

test('it offers a refresh that takes a newer build', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^v\d+\.\d+\.\d+$/ }).click();
  const refresh = page.locator('#version-notes').getByRole('button', { name: 'Refresh' });
  await expect(refresh).toBeEnabled();

  await refresh.click();
  // It reloads, so the surviving proof is that the page is still serving and
  // the badge is back rather than the click throwing.
  await expect(page.getByRole('button', { name: /^v\d+\.\d+\.\d+$/ })).toBeVisible();
});

test('the panel controls are translated even though the notes are not', async ({ page }) => {
  await page.goto('/de/');
  await page.getByRole('button', { name: /^v\d+\.\d+\.\d+$/ }).click();
  await expect(page.locator('#version-notes').getByRole('button', { name: 'Aktualisieren' })).toBeVisible();
  // The notes themselves stay in English, deliberately.
  await expect(page.locator('#version-notes')).toContainText('Watermark tool');
});
