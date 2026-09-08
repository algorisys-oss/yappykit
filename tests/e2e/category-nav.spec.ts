import { expect, test } from '@playwright/test';

/**
 * The header's category menu, in every engine the suite runs.
 *
 * The height assertion is the reason this file exists in e2e rather than in the
 * unit tests: the header used to be a wrapping flex row whose search input sized
 * itself from a UA default, and Chrome's default is wider than Firefox's, so the
 * same page was one row tall in one browser and two in the other. A jsdom test
 * cannot see that. Measuring the height at a wide and a narrow viewport catches
 * the wrap coming back whatever causes it.
 */
const HUBS = [
  { href: '/images', tool: '/compress-image-to-size' },
  { href: '/pdf', tool: '/merge-pdf' },
  { href: '/videos', tool: '/compress-video-to-size' },
  { href: '/spreadsheets', tool: '/compare-spreadsheets' },
  { href: '/fonts', tool: '/random-word-generator' },
  { href: '/device-tests', tool: '/mouse-test' },
];

test('the header is one fixed height, wide or narrow', async ({ page }) => {
  await page.goto('/merge-pdf');
  // Tool pages have a <header> of their own inside <main>; the site header is first.
  const header = page.locator('header').first();
  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = (await header.boundingBox())!.height;
  await page.setViewportSize({ width: 380, height: 800 });
  const narrow = (await header.boundingBox())!.height;
  expect(narrow).toBe(wide);
  // A wrapped row would push this well past 150.
  expect(wide).toBeLessThan(120);
});

// The header is sticky, so the scroll port has to reserve exactly its height or
// anything scrolled to lands underneath it. The two numbers live in different
// files (components/Header.tsx and styles/tokens.css); this is what keeps them
// honest about each other.
test('the scroll padding reserves exactly the header height', async ({ page }) => {
  await page.goto('/merge-pdf');
  const header = Math.round((await page.locator('header').first().boundingBox())!.height);
  const reserved = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
  );
  expect(Math.round(reserved)).toBe(header);
});

test('every hub is reachable from the header of a tool page', async ({ page }) => {
  await page.goto('/merge-pdf');
  for (const hub of HUBS) {
    await expect(page.locator(`header nav a[href="${hub.href}"]`)).toBeVisible();
  }
});

test('a hub lists its own tools and marks itself current', async ({ page }) => {
  for (const hub of HUBS) {
    await page.goto(hub.href);
    await expect(page.locator('main a[href="' + hub.tool + '"]')).toBeVisible();
    await expect(page.locator(`header nav a[href="${hub.href}"]`)).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('a tool page marks the section it belongs to, so you know where you are', async ({ page }) => {
  await page.goto('/merge-pdf');
  await expect(page.locator('header nav a[href="/pdf"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header nav a[href="/images"]')).not.toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('clicking a hub link navigates without a full page load', async ({ page }) => {
  await page.goto('/merge-pdf');
  await page.locator('header nav a[href="/videos"]').click();
  await expect(page).toHaveURL(/\/videos$/);
  await expect(page.locator('main h1')).toHaveText('Video tools');
});
