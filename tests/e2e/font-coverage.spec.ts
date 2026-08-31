import { expect, test, type Page } from '@playwright/test';
import { cmap4, cmapTable, nameTable, sfnt } from '../../src/core/font/fixtures';

/**
 * Finding a font, in a real browser.
 *
 * The unit tests prove the cmap reading against synthetic fonts in Node. What
 * only a browser can prove is the part jsdom cannot run: a real File is a real
 * Blob, and the reader pulls its ranges through Blob.slice and arrayBuffer.
 * That path is exercised here, in every browser the suite covers, including the
 * three that have no Local Font Access API at all.
 */

/** A font that has the Latin alphabet and a space, and nothing else. */
function latinOnlyFont(): Buffer {
  const bytes = sfnt({
    name: nameTable([
      { nameId: 1, value: 'E2E Sans' },
      { nameId: 2, value: 'Regular' },
    ]),
    cmap: cmapTable([
      {
        platform: 3,
        encoding: 1,
        data: cmap4([
          { start: 0x20, end: 0x20, delta: 0 },
          { start: 0x41, end: 0x5a, delta: 0 },
        ]),
      },
    ]),
  });
  return Buffer.from(bytes);
}

async function addLatinFont(page: Page) {
  await page.setInputFiles('#font-files', {
    name: 'E2ESans-Regular.ttf',
    mimeType: 'font/ttf',
    buffer: latinOnlyFont(),
  });
}

const RUPEE = '₹';

test('names the character a font is missing, and clears it when the text changes', async ({
  page,
}) => {
  await page.goto('/font-character-checker');
  await expect(
    page.getByRole('heading', { name: /find a font that can render your text/i, level: 1 }),
  ).toBeVisible();

  await page.locator('#font-text').fill(`ABC ${RUPEE}`);
  await addLatinFont(page);
  await expect(page.getByText('1 fonts to check.')).toBeVisible();

  // The rupee sign is the one character this font does not have.
  const missing = page.locator('li', { hasText: 'E2E Sans Regular' }).last();
  await expect(page.getByRole('heading', { name: 'Missing something' })).toBeVisible();
  await expect(missing).toContainText('Missing 1:');
  await expect(missing.getByTitle('U+20B9')).toHaveText(RUPEE);
  await expect(page.getByText('0 of 1 fonts.')).toBeVisible();

  // Drop the rupee and the same font becomes a complete match.
  await page.locator('#font-text').fill('ABC');
  await expect(page.getByText('1 of 1 fonts.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Missing something' })).toBeHidden();
  await expect(page.getByLabel('Your text set in E2E Sans Regular')).toHaveText('ABC');
});

test('says what is wrong with a file that is not a font', async ({ page }) => {
  await page.goto('/font-character-checker');
  await page.setInputFiles('#font-files', {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not a font'),
  });

  await expect(page.getByText('notes.txt: this is not a font file.')).toBeVisible();
  await expect(page.getByText(/No fonts loaded yet/)).toBeVisible();
});

test('the font never leaves the device', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploads.push(`${request.method()} ${request.url()}`);
  });

  await page.goto('/font-character-checker');
  await page.locator('#font-text').fill(`ABC ${RUPEE}`);
  await addLatinFont(page);
  await expect(page.getByText('1 fonts to check.')).toBeVisible();

  expect(uploads).toEqual([]);
});

test('offers the installed-font scan only where the browser can do it', async ({
  page,
  browserName,
}) => {
  await page.goto('/font-character-checker');
  const scan = page.getByRole('button', { name: 'Check my installed fonts' });

  if (browserName === 'chromium') {
    await expect(scan).toBeVisible();
  } else {
    // Firefox and WebKit have no Local Font Access API. The tool must say so
    // rather than showing a button that cannot work.
    await expect(scan).toHaveCount(0);
    await expect(page.getByText(/will not list your installed fonts/)).toBeVisible();
  }
});
