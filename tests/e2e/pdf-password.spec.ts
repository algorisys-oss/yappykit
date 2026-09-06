import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { bytesOf, pdfNeedsPassword, pdfText } from './helpers/fixtures';

/**
 * Password-protecting a PDF, in a real browser.
 *
 * The argv building and the error mapping are unit tested. What only a browser
 * can prove is the part that matters: that the engine runs at all here, and
 * that what comes out is a file a reader refuses to open without the password.
 *
 * The engine cannot be unit tested at all — qpdf's glue touches
 * `self.location.href` at module scope, so it does not load in node — and it
 * needs cross-origin isolation, which only arrives through `_headers`. That
 * makes this spec the only coverage the encryption itself has.
 *
 * Every assertion goes through pdf.js rather than through the raw bytes. A
 * search for `/Encrypt` would pass on a file that merely claims to be
 * protected; the claim is not the feature.
 */

const SECRET = 'CANARY-PHRASE-9174';
const PASSWORD = 'correct horse battery staple';

async function plainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText(SECRET, { x: 30, y: 100, size: 18, font });
  return Buffer.from(await doc.save());
}

async function open(page: Page, buffer: Buffer, name = 'report.pdf') {
  await page.goto('/password-protect-pdf');
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.getByText(new RegExp(name.replace('.', '\\.')))).toBeVisible({
    timeout: 30_000,
  });
}

async function download(page: Page, action: RegExp) {
  await page.getByRole('button', { name: action }).click();
  await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 60_000 });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /^download/i }).click(),
  ]);
  return bytesOf(file);
}

test.describe('password-protect a PDF', () => {
  test('the route is cross-origin isolated, or the engine cannot run', async ({ page }) => {
    // Not incidental: qpdf.wasm imports shared memory, and in a page without
    // isolation it hangs rather than failing. If this assertion goes red, every
    // other test in this file hangs for its full timeout, and production is
    // broken in a way no error message would explain.
    await page.goto('/password-protect-pdf');
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  });

  test('the protected file will not open without the password', async ({ page }) => {
    await open(page, await plainPdf());
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/type it again/i).fill(PASSWORD);
    const out = await download(page, /^add the password$/i);

    const refused = await pdfNeedsPassword(out);
    expect(refused.opened, 'a reader opened it with no password').toBe(false);
    expect(refused.reason).toBe('PasswordException');

    const wrong = await pdfNeedsPassword(out, 'not the password');
    expect(wrong.opened, 'a reader opened it with the wrong password').toBe(false);

    // And it is the same document, not a blank one that happens to be locked.
    expect(await pdfText(out, PASSWORD)).toContain(SECRET);
  });

  test('the text is really encrypted, not merely flagged', async ({ page }) => {
    await open(page, await plainPdf());
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/type it again/i).fill(PASSWORD);
    const out = await download(page, /^add the password$/i);

    // The unprotected original has the canary sitting in a Flate stream; the
    // protected one must not have it in the clear anywhere.
    expect(out.toString('latin1')).not.toContain(SECRET);
  });

  test('an already-protected file is offered the remove option, and round-trips', async ({
    page,
  }) => {
    await open(page, await plainPdf());
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/type it again/i).fill(PASSWORD);
    const locked = await download(page, /^add the password$/i);

    await open(page, locked, 'locked.pdf');
    // The tool should have noticed and preselected the verb that applies.
    await expect(page.getByRole('radio', { name: /remove a password/i })).toBeChecked();

    await page.getByLabel(/password this file opens with/i).fill(PASSWORD);
    const unlocked = await download(page, /^remove the password$/i);

    const free = await pdfNeedsPassword(unlocked);
    expect(free.opened, 'the password was not actually removed').toBe(true);
    expect(await pdfText(unlocked)).toContain(SECRET);
  });

  test('a wrong password is reported as a wrong password, not a generic failure', async ({
    page,
  }) => {
    await open(page, await plainPdf());
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/type it again/i).fill(PASSWORD);
    const locked = await download(page, /^add the password$/i);

    await open(page, locked, 'locked.pdf');
    await page.getByLabel(/password this file opens with/i).fill('wrong entirely');
    await page.getByRole('button', { name: /^remove the password$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/did not open the file/i, {
      timeout: 60_000,
    });
  });

  test('a mistyped confirmation is caught before anything is encrypted', async ({ page }) => {
    await open(page, await plainPdf());
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByLabel(/type it again/i).fill('correct horse battery stapl');

    await expect(page.getByText(/do not match/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^add the password$/i })).toBeDisabled();
  });
});
