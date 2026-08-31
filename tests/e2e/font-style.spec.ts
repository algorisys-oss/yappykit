import { expect, test, type Page } from '@playwright/test';
import { cmap4, cmapTable, head, hhea, nameTable, os2, post, sfnt, type Tables } from '../../src/core/font/fixtures';

/**
 * Ranking fonts by feel, in a real browser.
 *
 * The rubric is unit-tested against synthetic metrics in Node. What this adds
 * is the path only a browser has: a real File read through Blob ranges, the
 * appearance tables pulled out alongside the character map, and the answer
 * changing when the chosen feel changes.
 */

const CMAP = cmapTable([
  { platform: 3, encoding: 1, data: cmap4([{ start: 0x20, end: 0x7e, delta: 0 }]) },
]);

function fontOf(name: string, tables: Tables): Buffer {
  return Buffer.from(
    sfnt({
      cmap: CMAP,
      name: nameTable([
        { nameId: 1, value: name },
        { nameId: 2, value: 'Regular' },
      ]),
      post: post(0, false),
      head: head(1000),
      hhea: hhea(800, -200, 0),
      ...tables,
    }),
  );
}

/** A Didone: modern serif, moderate weight, small x-height, high contrast. */
const didone = () =>
  fontOf('E2E Didone', {
    'OS/2': os2({
      version: 4,
      weightClass: 400,
      widthClass: 5,
      familyClass: 3 << 8,
      panose: [2, 2, 6, 3, 8, 0, 0, 0, 0, 0],
      xHeight: 500,
      capHeight: 780,
    }),
  });

/** A heavy, wide, big-x-height sans. */
const black = () =>
  fontOf('E2E Black', {
    'OS/2': os2({
      version: 4,
      weightClass: 900,
      widthClass: 6,
      familyClass: 8 << 8,
      xHeight: 560,
      capHeight: 700,
    }),
  });

/** A font that never wrote down what it looks like. */
const silent = () => fontOf('E2E Silent', {});

async function addFonts(page: Page) {
  await page.setInputFiles('#style-files', [
    { name: 'E2EDidone-Regular.ttf', mimeType: 'font/ttf', buffer: didone() },
    { name: 'E2EBlack-Regular.ttf', mimeType: 'font/ttf', buffer: black() },
  ]);
  await expect(page.getByText('2 fonts to rank.')).toBeVisible();
}

const matches = (page: Page) =>
  page
    .locator('h2', { hasText: 'Matches' })
    .locator('xpath=following-sibling::ul[1]')
    .locator('li');

test('the chosen feel changes which font wins', async ({ page }) => {
  await page.goto('/font-style-finder');
  await expect(
    page.getByRole('heading', { name: /find a font that feels the way you want/i, level: 1 }),
  ).toBeVisible();

  await addFonts(page);

  // Elegant is the Didone: serif, moderate weight, small x-height, high contrast.
  await expect(matches(page)).toHaveCount(1);
  await expect(matches(page).first()).toContainText('E2E Didone Regular');

  // Loud is the other one, on weight, width and x-height.
  await page.getByRole('radio', { name: 'Loud' }).click();
  await expect(matches(page)).toHaveCount(1);
  await expect(matches(page).first()).toContainText('E2E Black Regular');
});

test('shows the traits behind a result, not just the result', async ({ page }) => {
  await page.goto('/font-style-finder');
  await addFonts(page);

  const winner = matches(page).first();
  await expect(winner).toContainText('Matched letterforms, weight, x-height, contrast');

  // The sample is set in the font being described.
  await expect(page.getByLabel('Sample set in E2E Didone Regular')).toHaveText('Handgloves');
});

test('sets aside a font that never recorded how it looks', async ({ page }) => {
  await page.goto('/font-style-finder');
  await page.setInputFiles('#style-files', {
    name: 'E2ESilent-Regular.ttf',
    mimeType: 'font/ttf',
    buffer: silent(),
  });

  // Not a bad match: no basis for a verdict at all, and it says so.
  await expect(page.getByRole('heading', { name: 'Not enough information' })).toBeVisible();
  await expect(page.getByText('E2E Silent Regular')).toBeVisible();
  await expect(page.getByText('0 of 1 fonts match on every trait that could be checked.')).toBeVisible();
});

test('the fonts never leave the device', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') uploads.push(`${r.method()} ${r.url()}`);
  });

  await page.goto('/font-style-finder');
  await addFonts(page);
  expect(uploads).toEqual([]);
});

test('offers the installed-font scan only where the browser can do it', async ({
  page,
  browserName,
}) => {
  await page.goto('/font-style-finder');
  const scan = page.getByRole('button', { name: 'Use my installed fonts' });

  if (browserName === 'chromium') {
    await expect(scan).toBeVisible();
  } else {
    await expect(scan).toHaveCount(0);
    await expect(page.getByText(/will not list your installed fonts/)).toBeVisible();
  }
});
