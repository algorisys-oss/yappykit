import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bytesOf, dragAcross, measure, pdfText, pngOf, type Rgb } from './helpers/fixtures';

/**
 * Redaction, in a real browser.
 *
 * This is the one tool on the site where a regression is a harm rather than an
 * annoyance. The promise is that what was under a box is destroyed and not
 * merely covered, which is the difference between this and drawing a black
 * rectangle in a PDF reader: documents get published every year with their
 * secrets still selectable underneath the rectangle.
 *
 * So the assertion is not that the tool reported success. It is that a PDF
 * reader can no longer find the secret in what it handed back.
 *
 * Note what is NOT used here: a search of the raw bytes for the string. PDF
 * content streams are Flate-compressed, so that search comes back clean on the
 * untouched fixture too, and a spec built on it passes whether or not the tool
 * does anything. The first assertion of the first test is therefore about the
 * fixture, to prove the test can fail at all.
 */

const SECRET = 'SECRET-1234-XYZ';
const KEPT = 'KEEP-THIS-LINE';

/** A one-page PDF with the secret near the top and a line to keep below it. */
async function pdfWithSecret(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(SECRET, { x: 40, y: 330, size: 24, font });
  page.drawText(KEPT, { x: 40, y: 80, size: 24, font });
  return Buffer.from(await doc.save());
}

async function redact(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /^redact and download$/i }).click();
      await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 60_000 });
      await page.getByRole('link', { name: /download the redacted copy/i }).click();
    })(),
  ]);
  return bytesOf(download);
}

test('destroys the text under the box rather than covering it', async ({ page }) => {
  await page.goto('/redact-a-document');
  await page.setInputFiles('input[type="file"]', {
    name: 'statement.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithSecret(),
  });

  // The premise: this fixture really does carry selectable text. Without this
  // the test below could pass against a tool that does nothing.
  expect((await pdfText(await pdfWithSecret())).join(' ')).toContain(SECRET);

  const canvas = page.locator('canvas, img[alt*="Page"]').first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // The secret sits in the top fifth of a 400pt page.
  await dragAcross(page, canvas, [0.05, 0.1], [0.9, 0.25]);
  await expect(page.getByText(/^1 box$/)).toBeVisible();

  const out = await redact(page);

  // The point of the whole tool: a reader can no longer find the secret.
  const after = await pdfText(out);
  expect(after.join(' ')).not.toContain(SECRET);

  // Rasterising takes every text object with it, not just the covered one.
  expect(after).toEqual([]);

  // Still a readable one-page PDF, not a broken file that trivially has no text.
  const doc = await PDFDocument.load(out);
  expect(doc.getPageCount()).toBe(1);
  expect(out.length).toBeGreaterThan(1000);
});

test('paints the box onto the pixels of an image', async ({ page }) => {
  const WIDTH = 300;
  const HEIGHT = 200;
  const WHITE: Rgb = [255, 255, 255];
  const INK: Rgb = [200, 20, 20];
  // A red band across the top third stands in for the sensitive line.
  const fixture = pngOf(WIDTH, HEIGHT, (_x, y) => (y < HEIGHT / 3 ? INK : WHITE));

  await page.goto('/redact-a-document');
  await page.setInputFiles('input[type="file"]', {
    name: 'card.png',
    mimeType: 'image/png',
    buffer: fixture,
  });

  const preview = page.locator('canvas, img[alt*="Page"], img[src^="blob:"]').first();
  await expect(preview).toBeVisible({ timeout: 30_000 });
  // Inset rather than starting on the very edge: a drag beginning exactly on
  // the element boundary is swallowed by Firefox, which is a fact about the
  // test's mouse coordinates and not about the tool.
  await dragAcross(page, preview, [0.03, 0.03], [0.97, 0.34]);
  await expect(page.getByText(/^1 box$/), 'the drag must register as a box').toBeVisible();

  const out = await redact(page);

  // The band is gone; the untouched part of the picture is still white.
  const seen = await measure(page, out, [
    [10, 10],
    [WIDTH / 2, 20],
    [WIDTH / 2, HEIGHT - 10],
  ]);
  expect({ w: seen.width, h: seen.height }).toEqual({ w: WIDTH, h: HEIGHT });
  for (const px of seen.pixels.slice(0, 2)) {
    expect(px, 'the redacted band must not still be the ink colour').not.toEqual(INK);
  }
  expect(seen.pixels[2]![0]).toBeGreaterThan(200);
});

test('will not redact until a box is drawn', async ({ page }) => {
  await page.goto('/redact-a-document');
  await page.setInputFiles('input[type="file"]', {
    name: 'statement.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithSecret(),
  });
  await expect(page.locator('canvas, img[alt*="Page"]').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^redact and download$/i }).click();
  await expect(page.getByText(/draw at least one box first/i)).toBeVisible();
});
