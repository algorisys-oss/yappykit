import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bytesOf, measure, sniff, unzip } from './helpers/fixtures';

/**
 * Turning a PDF into pictures, in a real browser.
 *
 * This one cannot be unit tested at all: pdfjs reaches for DOMMatrix at module
 * load, so it will not even import under jsdom, and the pure helpers were moved
 * into plan.ts precisely so that something could be tested without it. Which
 * leaves the actual rasterising unproven anywhere but here.
 *
 * The claim under test is that the resolution follows what the pictures are
 * for. "Printing" has to produce more pixels than "Screen or email" from the
 * same page, or the choice is decoration.
 */

const PAGES = 3;
const PAGE_PT = 300; // a 300pt square page

async function squarePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= PAGES; n += 1) {
    doc.addPage([PAGE_PT, PAGE_PT]).drawText(`P${n}`, { x: 40, y: 150, size: 40, font });
  }
  return Buffer.from(await doc.save());
}

async function load(page: import('@playwright/test').Page) {
  await page.goto('/pdf-to-images');
  await page.setInputFiles('input[type="file"]', {
    name: 'deck.pdf',
    mimeType: 'application/pdf',
    buffer: await squarePdf(),
  });
}

async function render(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^convert to images$/i }).click();
  await expect(page.getByRole('status')).toContainText(/images/i, { timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download all as a zip/i }).click(),
  ]);
  return unzip(await bytesOf(download));
}

test('gives one image per page, in the format asked for', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^jpg/i }).click();

  const images = await render(page);
  expect(images).toHaveLength(PAGES);
  for (const image of images) {
    expect(sniff(image.bytes)).toBe('jpeg');
  }
  // Named so they sort back into page order.
  expect(images.map((i) => i.name)).toEqual([...images.map((i) => i.name)].sort());
});

test('PNG is offered for line art and really is PNG', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^png/i }).click();

  const images = await render(page);
  expect(images).toHaveLength(PAGES);
  expect(sniff(images[0]!.bytes)).toBe('png');
});

test('printing produces more pixels than screen, from the same page', async ({ page }) => {
  await load(page);
  await page.getByRole('radio', { name: /^jpg/i }).click();

  await page.getByRole('radio', { name: /^screen or email$/i }).click();
  const screen = await measure(page, (await render(page))[0]!.bytes);

  await page.getByRole('radio', { name: /^printing$/i }).click();
  const print = await measure(page, (await render(page))[0]!.bytes);

  expect(print.width).toBeGreaterThan(screen.width);
  // A square page stays square whatever the resolution.
  expect(screen.width).toBe(screen.height);
  expect(print.width).toBe(print.height);
});

test('says what resolution it is about to use', async ({ page }) => {
  await load(page);
  await expect(page.getByText(/rendered at \d+ DPI/i)).toBeVisible();
});

test('asks for a file before it will do anything', async ({ page }) => {
  await page.goto('/pdf-to-images');
  await page.getByRole('button', { name: /^convert to images$/i }).click();
  await expect(page.getByText(/choose a pdf first/i)).toBeVisible();
});
