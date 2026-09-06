import { expect, test, type Page } from '@playwright/test';

/**
 * The pages that are not tools.
 *
 * These exist because AdSense rejected the site for low content quality, and
 * the diagnosis was not that the tool pages were thin (they are not) but that
 * there was nothing else: no contact route, no editorial content, and a footer
 * that named a different operator than the About page did. So the things worth
 * asserting here are the things a reviewer or a crawler checks.
 *
 * Everything is checked with JavaScript DISABLED where the claim is about what
 * a crawler sees. A page that only assembles itself once Solid boots is not a
 * page as far as this test is concerned.
 */

/** What a crawler gets: the raw HTML, no scripts run. */
async function rawText(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path);
  expect(res.status(), `${path} should be served`).toBe(200);
  return (await res.text())
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

test.describe('content pages', () => {
  test('the contact page is reachable and says how to reach a person', async ({ page }) => {
    const text = await rawText(page, '/contact');
    expect(text).toContain('osappsupport@gmail.com');
    // The honest section: these are architectural limits, not policies, and
    // dropping them would quietly turn the page into a generic contact form.
    expect(text).toMatch(/cannot recover a lost password/i);
    expect(text).toMatch(/Algorisys Technologies/);
  });

  test('every page names the same operator', async ({ page }) => {
    // The rejection-worthy version of this had the footer saying one thing and
    // the About page, Terms and Privacy saying another.
    for (const path of ['/about', '/terms', '/privacy', '/contact']) {
      const text = await rawText(page, path);
      expect(text, `${path} should name the operator`).toMatch(/Algorisys Technologies/);
      expect(text, `${path} should not still name an individual as operator`).not.toMatch(
        /personal project operated by|built and run by Rajesh Pillai/,
      );
    }
  });

  test('the explainer is substantial and prerendered', async ({ page }) => {
    const text = await rawText(page, '/how-it-works');
    expect(text.split(' ').length).toBeGreaterThan(1200);
    // It has to tell the reader how to disprove the claim, or it is marketing.
    expect(text).toMatch(/Network tab/);
    expect(text).toMatch(/cross-origin isolated/i);
  });

  test('the build hub lists the guides, and each one renders with its code', async ({ page }) => {
    const hub = await rawText(page, '/build');
    expect(hub).toMatch(/Build guides/);

    const text = await rawText(page, '/build/password-protect-pdf');
    expect(text.split(' ').length).toBeGreaterThan(1000);
    // The code samples are the point; if escaping broke they would be gone.
    expect(text).toMatch(/buildEncryptArgv/);
    expect(text).toMatch(/What went wrong/);
  });

  test('a tool links to its build guide in English, and not in German', async ({ page }) => {
    const en = await page.request.get('/password-protect-pdf');
    expect(await en.text()).toContain('/build/password-protect-pdf');

    // The guides are English-only, so a translated page must not send a reader
    // to an article they cannot read.
    const de = await page.request.get('/de/pdf-mit-passwort-schuetzen');
    expect(await de.text()).not.toContain('/build/password-protect-pdf');
  });

  test('the footer links the new pages from every page', async ({ page }) => {
    const tool = await (await page.request.get('/merge-pdf')).text();
    expect(tool).toContain('href="/contact"');
    expect(tool).toContain('href="/how-it-works"');
    expect(tool).toContain('href="/build"');
  });

  test('the contact page is translated, and reachable in another locale', async ({ page }) => {
    const de = await rawText(page, '/de/kontakt');
    expect(de).toMatch(/Kontakt/);
    expect(de).toContain('osappsupport@gmail.com');
  });
});
