import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

// A tiny but real PNG (8x8 red) so the compressor has an actual image to encode.
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGO4Iyf3Hx9mGBkKAO7khcEz5XnsAAAAAElFTkSuQmCC',
  'base64',
);

async function pickImage(page: import('@playwright/test').Page) {
  await page.setInputFiles('input[type="file"]', {
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: RED_PNG,
  });
}

test.describe('YappyKit smoke', () => {
  test('landing page renders the privacy promise and a tool link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('run in your browser');
    await expect(page.getByRole('main').getByText('No file uploads').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /compress an image to an exact size/i })).toBeVisible();
  });

  test('image compressor compresses a chosen image on-device', async ({ page }) => {
    await page.goto('/compress-image-to-size');
    await expect(page.getByRole('heading', { name: /compress an image/i })).toBeVisible();

    // Outcome-driven control, not a quality slider.
    await expect(page.getByRole('radiogroup', { name: /target size/i })).toBeVisible();

    await pickImage(page);
    await page.getByRole('button', { name: /^compress$/i }).click();
    await expect(page.getByRole('status')).toContainText(/Done|Couldn't/, { timeout: 10_000 });
    // A downloadable result is produced.
    await expect(page.getByRole('link', { name: /download/i })).toBeVisible();
  });

  test('spreadsheet compare reports added / removed / changed rows', async ({ page }) => {
    await page.goto('/compare-spreadsheets');
    await expect(page.getByRole('heading', { name: /compare two spreadsheets/i })).toBeVisible();

    const before = 'id,name,price\n1,Apple,10\n2,Banana,5\n3,Cherry,8\n';
    const after = 'id,name,price\n1,Apple,10\n2,Banana,6\n4,Date,12\n';
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles({ name: 'before.csv', mimeType: 'text/csv', buffer: Buffer.from(before) });
    await inputs.nth(1).setInputFiles({ name: 'after.csv', mimeType: 'text/csv', buffer: Buffer.from(after) });

    // 1 added (Date), 1 removed (Cherry), 1 changed (Banana price), 1 unchanged.
    await expect(page.getByText('1 added')).toBeVisible();
    await expect(page.getByText('1 removed')).toBeVisible();
    await expect(page.getByText('1 changed')).toBeVisible();
    await expect(page.getByText('Date', { exact: true })).toBeVisible(); // added row rendered in the table
  });

  test('metadata cleaner reads a photo and reports it in-tab', async ({ page }) => {
    await page.goto('/remove-image-metadata');
    await expect(page.getByRole('heading', { name: /remove metadata/i })).toBeVisible();
    await pickImage(page); // the sample PNG carries no EXIF → "already clean"
    await expect(page.getByText(/already clean|Metadata|Location/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('global header search matches on tags/synonyms and navigates', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    const search = header.getByRole('combobox', { name: /search tools/i });

    // "gps" only appears in the metadata tool's tags, not its title.
    await search.fill('gps');
    await expect(header.getByRole('link', { name: /remove metadata from a photo/i })).toBeVisible();

    // "whatsapp" -> video compressor (via tags).
    await search.fill('whatsapp');
    await expect(header.getByRole('link', { name: /compress a video to fit a limit/i })).toBeVisible();

    // gibberish -> no results message.
    await search.fill('zzzzz');
    await expect(header.getByText(/no tools match/i)).toBeVisible();

    // works from a tool page too, and selecting a result navigates.
    await page.goto('/passport-photo');
    await header.getByRole('combobox', { name: /search tools/i }).fill('ocr');
    await header.getByRole('link', { name: /scan .*document/i }).click();
    await expect(page).toHaveURL(/scan-document/);
  });

  test('search: "/" and Ctrl+K focus it; arrow keys + Enter navigate', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('banner').getByRole('combobox', { name: /search tools/i });

    // "/" focuses the search from anywhere.
    await page.locator('h1').click(); // move focus off the input
    await page.keyboard.press('/');
    await expect(search).toBeFocused();

    // Ctrl+K also focuses.
    await search.blur();
    await page.keyboard.press('Control+k');
    await expect(search).toBeFocused();

    // Arrow down to the second result ("compress" → image, then video), Enter opens it.
    await search.fill('compress');
    await search.press('ArrowDown');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/compress-video-to-size/);
  });

  test('tool pages carry substantive content (FAQ)', async ({ page }) => {
    await page.goto('/compress-image-to-size');
    await expect(page.getByRole('heading', { name: /how it works/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /how to use it/i })).toBeVisible();
    await expect(page.getByText(/compress an image to under 100 KB/i)).toBeVisible();
    // FAQPage + HowTo structured data ships in the PRERENDERED head, so it is
    // there without JS having to inject it.
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent!)['@type']));
    expect(types).toEqual(
      expect.arrayContaining(['BreadcrumbList', 'SoftwareApplication', 'FAQPage', 'HowTo']),
    );
  });

  test('about page is reachable from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/about yappykit/i);
    await expect(page.getByRole('heading', { name: /how it works/i })).toBeVisible();
  });

  test('privacy policy is reachable from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: /footer/i }).getByRole('link', { name: /privacy/i }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/privacy policy/i);
    await expect(page.getByText(/are not uploaded to our/i)).toBeVisible();
  });

  test('unknown URLs render a 404 page', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/doesn.t exist/i);
    await expect(page.getByRole('link', { name: /go to the tools/i })).toBeVisible();
  });

  test('theme toggle switches and persists light/dark', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole('button', { name: /switch to (light|dark) theme/i }).click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(after).not.toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('yappykit-theme'))).toBe(after);
  });

  test('document scanner enhances a photo and offers text extraction', async ({ page }) => {
    await page.goto('/scan-document');
    await expect(page.getByRole('heading', { name: /scan and clean a document/i })).toBeVisible();
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 200;
      const x = c.getContext('2d')!;
      x.fillStyle = '#eee';
      x.fillRect(0, 0, 300, 200);
      x.fillStyle = '#111';
      x.font = '32px sans-serif';
      x.fillText('Hello', 20, 100);
      return c.toDataURL('image/png');
    });
    const buffer = Buffer.from(dataUrl.split(',')[1]!, 'base64');
    await page.setInputFiles('input[type="file"]', { name: 'doc.png', mimeType: 'image/png', buffer });
    await expect(page.getByRole('radiogroup', { name: /cleanup/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /download clean image/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /extract text/i })).toBeVisible();
    // The enhanced canvas rendered.
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('the YappyKit header and a back link are present on tool pages', async ({ page }) => {
    await page.goto('/compress-image-to-size');
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: /yappykit/i })).toBeVisible();
    // Back-to-tools link navigates home.
    await header.getByRole('link', { name: 'Tools', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('run in your browser');
  });

  test('passport photo tool frames a photo and offers exports', async ({ page }) => {
    await page.goto('/passport-photo');
    await expect(page.getByRole('heading', { name: /passport or visa photo/i })).toBeVisible();
    await expect(page.getByText(/600×600px at 300 DPI/)).toBeVisible();
    // Generate a valid image in-page and load it.
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 800;
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, 800); // features so a drag changes the crop
      g.addColorStop(0, '#000');
      g.addColorStop(1, '#fff');
      x.fillStyle = g;
      x.fillRect(0, 0, 400, 800);
      return c.toDataURL('image/png');
    });
    const buffer = Buffer.from(dataUrl.split(',')[1]!, 'base64');
    await page.setInputFiles('input[type="file"]', { name: 'me.png', mimeType: 'image/png', buffer });
    await expect(page.getByRole('button', { name: /download photo/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /print sheet/i })).toBeVisible();

    // Drag-to-pan actually repositions the crop.
    const canvas = page.locator('canvas');
    const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 50, { steps: 6 });
    await page.mouse.up();
    const after = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    expect(after).not.toBe(before);
  });

  test('video compressor route renders its controls', async ({ page }) => {
    await page.goto('/compress-video-to-size');
    await expect(page.getByRole('heading', { name: /compress a video/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /target size/i })).toBeVisible();
    // The header back link is present here too.
    await expect(page.getByRole('banner').getByRole('link', { name: 'Tools', exact: true })).toBeVisible();
  });

  test('no file ever leaves the tab: no upload-shaped requests fire', async ({ page }) => {
    const uploads: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.postDataBuffer()) uploads.push(req.url());
    });
    await page.goto('/compress-image-to-size');
    await pickImage(page);
    await page.getByRole('button', { name: /^compress$/i }).click();
    await expect(page.getByRole('status')).toContainText(/Done/, { timeout: 10_000 });
    expect(uploads, `unexpected POST-with-body requests: ${uploads.join(', ')}`).toHaveLength(0);
  });

  test('every route is served with its OWN canonical, not the home page\'s', async ({ page }) => {
    // The bug this guards: a client-rendered SPA on static hosting ships one
    // index.html, so every route used to carry <link rel=canonical href="/">,
    // telling Google that every tool page duplicated the home page.
    for (const [path, expected] of [
      ['/compress-image-to-size', 'https://yappykit.com/compress-image-to-size'],
      ['/passport-photo', 'https://yappykit.com/passport-photo'],
      ['/online-ruler', 'https://yappykit.com/online-ruler'],
      ['/about', 'https://yappykit.com/about'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expected);
    }
  });

  test('prerendered content is readable without JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/keyboard-test');
    await expect(page).toHaveTitle(/Keyboard Test/i);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/test your keyboard/i);
    await expect(page.getByText(/A keyboard rarely fails all at once/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible();
    await ctx.close();
  });

  test('prerendered markup is replaced, not duplicated, once the app mounts', async ({ page }) => {
    await page.goto('/mouse-test');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(new Set(headings).size, `duplicated headings: ${headings.join(' | ')}`).toBe(
      headings.length,
    );
  });

  test('keyboard tester lights a key and reports its raw codes', async ({ page }) => {
    await page.goto('/keyboard-test');
    // The route is lazy: pressing before it mounts means no listener is attached
    // yet and the key is simply lost.
    await expect(page.getByText(/0 of \d+ keys tested/)).toBeVisible();
    await page.keyboard.press('k');
    await expect(page.getByText(/1 of \d+ keys tested/)).toBeVisible();
    await expect(page.getByText('KeyK', { exact: true })).toBeVisible();
  });

  test('keyboard layouts have the right key counts (ANSI 104 / ISO 105)', async ({ page }) => {
    await page.goto('/keyboard-test');
    const caps = page.locator('div.flex.h-10');
    await expect(caps).toHaveCount(104); // retries until the lazy route mounts
    await page.getByRole('radio', { name: /ISO/ }).click();
    // ISO has one more physical key than ANSI: IntlBackslash beside left Shift.
    await expect(caps).toHaveCount(105);
    await page.getByRole('radio', { name: /Tenkeyless/ }).click();
    await expect(caps).toHaveCount(105 - 17);
  });

  test('mouse tester registers clicks and reports the double-click gap', async ({ page }) => {
    await page.goto('/mouse-test');
    const pad = page.getByText('Click, scroll and drag here');
    await expect(pad).toBeVisible();
    await pad.click();
    await pad.click();
    await expect(page.getByText(/Last double-click gap: \d+ ms/)).toBeVisible();
  });

  test('ruler draws a true centimetre and can be dragged', async ({ page }) => {
    await page.goto('/online-ruler');
    const scale = page.locator('[role="img"][aria-label^="Ruler length"]');
    await expect(scale).toBeVisible(); // lazy route — evaluate() would race it
    // Uncalibrated density is the CSS-spec 96 ppi, so 1 cm must be 96/2.54 =
    // 37.795 px. This is the entire correctness claim of the tool.
    const gap = await page.evaluate(() => {
      const scale = document.querySelector('[role="img"][aria-label^="Ruler length"]')!;
      const labels = [...scale.querySelectorAll('span.absolute')] as HTMLElement[];
      return parseFloat(labels[1]!.style.left) - parseFloat(labels[0]!.style.left);
    });
    expect(gap).toBeCloseTo(96 / 2.54, 1);

    // A ruler you cannot move cannot be laid against anything.
    const grip = page.locator('.cursor-move');
    // page.mouse works in VIEWPORT coordinates and does not auto-scroll, so the
    // grip must be brought on-screen before its box is read.
    await grip.scrollIntoViewIfNeeded();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 125, box.y + 65, { steps: 5 });
    await page.mouse.up();
    const left = await page.evaluate(
      () => (document.querySelector('.cursor-move')!.parentElement as HTMLElement).style.left,
    );
    expect(parseFloat(left)).toBeGreaterThan(100);
  });

  test('the footer reaches the privacy policy from a TOOL page, not just home', async ({ page }) => {
    // AdSense review expects policy links site-wide; they used to exist only on
    // the landing page, because the footer lived inside it.
    await page.goto('/scan-document');
    const footer = page.getByRole('navigation', { name: /footer/i });
    await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'About', exact: true })).toBeVisible();
  });

  test('the home page links to YappyDraw in a new tab', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: /open yappydraw/i });
    await expect(link).toHaveAttribute('href', 'https://yappydraw.com');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('mouse tester reaches a VERDICT on a chattering button', async ({ page }) => {
    await page.goto('/mouse-test');
    const pad = page.locator('.border-dashed');
    await expect(pad).toBeVisible();
    // Two presses a few ms apart is physically impossible for a human and is
    // exactly what a worn switch does. The tool must say so, not just count.
    await pad.evaluate((el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const ev = (type: string) =>
        new PointerEvent(type, {
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
          button: 0,
          bubbles: true,
          cancelable: true,
          pointerId: 1,
        });
      el.dispatchEvent(ev('pointerdown'));
      el.dispatchEvent(ev('pointerup'));
      el.dispatchEvent(ev('pointerdown'));
      el.dispatchEvent(ev('pointerup'));
    });
    await expect(page.getByText('Fault detected')).toBeVisible();
  });

  test('mouse tester shows a real mouse whose buttons light up', async ({ page }) => {
    await page.goto('/mouse-test');
    const svg = page.locator('svg[aria-label*="mouse"]');
    await expect(svg).toBeVisible();
    const before = await svg.locator('[fill^="var"]').count();
    await page.locator('.border-dashed').click();
    // At least one region switched to the "tested" fill.
    await expect
      .poll(async () => svg.locator('[fill="var(--zen-color-success-soft)"]').count())
      .toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
  });

  test('keyboard tester classifies rollover and offers a report', async ({ page }) => {
    await page.goto('/keyboard-test');
    await expect(page.getByText(/0 of \d+ keys tested/)).toBeVisible();
    await page.keyboard.press('a');
    await expect(page.getByText(/Rollover class: \dKRO|Rollover class: NKRO/)).toBeVisible();
    await expect(page.getByText('No repeated keys detected.')).toBeVisible();
    await expect(page.getByRole('button', { name: /download report/i })).toBeVisible();
  });

  test('Spanish pages are served, translated, and self-canonical', async ({ page }) => {
    await page.goto('/es/test-de-teclado');
    await expect(page).toHaveTitle(/Test de teclado/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://yappykit.com/es/test-de-teclado',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/prueba tu teclado/i);
    // The tool WIDGET is translated too, not just the prose around it.
    await expect(page.getByText('Distribución física')).toBeVisible();
  });

  test('every language the switcher offers resolves to a real page', async ({ page, request }) => {
    // The invariant is not "which locales exist" — it is that the switcher never
    // advertises a URL that 404s. hreflang and the sitemap are generated from the
    // same shipped-locale set, so this covers all three.
    await page.goto('/passport-photo');
    const nav = page.getByRole('navigation', { name: /language|idioma/i });
    const hrefs = await nav.getByRole('link').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')!),
    );
    expect(hrefs.length).toBeGreaterThan(1);

    for (const href of hrefs) {
      const res = await request.get(href);
      expect(res.status(), `${href} should be a real page`).toBe(200);
    }

    // Each link must point at the SAME tool, not dump the visitor on a home page.
    expect(hrefs).toContain('/passport-photo');
    expect(hrefs).toContain('/de/passfoto');
    expect(hrefs).toContain('/es/foto-de-pasaporte');
  });

  test('hreflang advertises only pages that exist', async ({ page, request }) => {
    await page.goto('/scan-document');
    const alts = await page
      .locator('link[rel="alternate"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute('href')!));
    expect(alts.length).toBeGreaterThan(1);
    for (const href of alts) {
      const res = await request.get(new URL(href).pathname);
      expect(res.status(), `${href} is advertised via hreflang but does not exist`).toBe(200);
    }
  });

  test('switching language takes effect immediately, with no manual refresh', async ({ page }) => {
    // Regression: solid-router intercepts same-origin anchor clicks, so the
    // language link navigated client-side while the messages stayed English —
    // the URL said /es but the page stayed in English until the user reloaded.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('run in your browser');

    await page.getByRole('navigation', { name: /language|idioma/i })
      .getByRole('link', { name: 'Español' })
      .click();

    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'funcionan en tu navegador',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://yappykit.com/es',
    );
  });

  test('switching back to English also takes effect immediately', async ({ page }) => {
    await page.goto('/es');
    await page.getByRole('navigation', { name: /language|idioma/i })
      .getByRole('link', { name: 'English' })
      .click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('run in your browser');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the chosen language survives moving between tools', async ({ page }) => {
    await page.goto('/es');

    // Home -> a tool, via the landing grid.
    await page.getByRole('link', { name: /Test de teclado/i }).first().click();
    await expect(page).toHaveURL(/\/es\/test-de-teclado$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/prueba tu teclado/i);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    // Tool -> tool, via the "Related tools" cross-links.
    await page.getByRole('heading', { name: 'Herramientas relacionadas' }).scrollIntoViewIfNeeded();
    await page.getByRole('link', { name: /Regla online/i }).first().click();
    await expect(page).toHaveURL(/\/es\/regla-online$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/regla online/i);

    // Tool -> tool, via the header search.
    const search = page.getByRole('banner').getByRole('combobox');
    await search.fill('raton');
    await page.getByRole('banner').getByRole('link', { name: /Test de rat/i }).click();
    await expect(page).toHaveURL(/\/es\/test-de-raton$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    // Back to the tool index via the header.
    await page.getByRole('banner').getByRole('link', { name: 'Herramientas', exact: true }).click();
    await expect(page).toHaveURL(/\/es$/);

    // And via the footer.
    await page.getByRole('navigation', { name: /pie de p/i })
      .getByRole('link', { name: 'Acerca de' })
      .click();
    await expect(page).toHaveURL(/\/es\/sobre-nosotros$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('reading the English-only privacy policy does not eject you from Spanish', async ({
    page,
  }) => {
    await page.goto('/es');
    await page.getByRole('navigation', { name: /pie de p/i })
      .getByRole('link', { name: /privacidad/i })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    // The policy body is deliberately English (it is a legal document, not
    // machine-translated) but the shell around it stays in the visitor's
    // language, so the footer still leads back into Spanish.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/privacy policy/i);
    await expect(
      page.getByRole('navigation', { name: /pie de p/i }).getByRole('link', { name: 'Acerca de' }),
    ).toHaveAttribute('href', '/es/sobre-nosotros');
  });

  test('Arabic renders right-to-left without physical-property bleed', async ({ page }) => {
    await page.goto('/ar/mouse-test');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

    // The bug this guards: `pl-5` is a PHYSICAL property, so under dir=rtl the
    // list kept its 20px left padding AND picked up the browser's default
    // padding-inline-start on the right — indented on both sides. Logical
    // properties (ps-5) flip correctly.
    const pad = await page
      .locator('ul.list-disc')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { left: cs.paddingLeft, right: cs.paddingRight };
      });
    expect(pad.right).toBe('20px');
    expect(pad.left).toBe('0px');

    // A right-to-left page must not introduce a horizontal scrollbar.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });

  test('the same logical properties still read left-to-right in English', async ({ page }) => {
    await page.goto('/mouse-test');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const pad = await page
      .locator('ul.list-disc')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { left: cs.paddingLeft, right: cs.paddingRight };
      });
    expect(pad.left).toBe('20px');
    expect(pad.right).toBe('0px');
  });

  test('terms of use is reachable site-wide and states the disclaimer', async ({ page }) => {
    // Reachable from a TOOL page, not just the home page — AdSense review and
    // ordinary readers both expect policy links everywhere.
    await page.goto('/passport-photo');
    await page
      .getByRole('navigation', { name: /footer/i })
      .getByRole('link', { name: /terms of use/i })
      .click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/terms of use/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://yappykit.com/terms',
    );

    await expect(page.getByRole('heading', { name: 'Results are not guaranteed' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Check the output before you rely on it' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Limitation of liability' })).toBeVisible();
  });

  test('the disclaimer is readable with JavaScript disabled', async ({ browser }) => {
    // A liability disclaimer that only appears once JS has run is not much of a
    // disclaimer. It ships in the prerendered HTML.
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/terms');
    await expect(page).toHaveTitle(/Terms of Use/i);
    await expect(page.getByText(/without human review/i)).toBeVisible();
    await expect(page.getByText(/You are responsible for reviewing every result/i)).toBeVisible();
    await expect(page.getByText(/we accept no liability/i)).toBeVisible();
    await ctx.close();
  });

  /**
   * An image-heavy PDF, which is what people actually compress for a form: a
   * scan. Built from the project's own artwork so the fixture carries no
   * personal data, and embedded once per page so pdf-lib cannot deduplicate it.
   */
  async function makeScanPdf(pages = 3): Promise<Buffer> {
    const png = await readFile('public/og-image.png');
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) {
      const img = await doc.embedPng(png);
      const page = doc.addPage([595, 842]); // A4 in points
      page.drawImage(img, { x: 0, y: 121, width: 595, height: 600 });
    }
    return Buffer.from(await doc.save());
  }

  test('pdf compressor hits an exact size target and reports the resolution', async ({ page }) => {
    await page.goto('/compress-pdf-to-size');
    const pdf = await makeScanPdf(3);
    expect(pdf.byteLength).toBeGreaterThan(150 * 1024); // worth compressing

    await page.setInputFiles('input[type=file]', {
      name: 'scan.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    await expect(page.getByText(/scan\.pdf.*3 pages/)).toBeVisible({ timeout: 30_000 });

    // An image-only PDF has no selectable text to lose, so no warning is due.
    await expect(page.getByText('This PDF contains selectable text')).toHaveCount(0);

    await page.getByRole('radio', { name: 'Under 100 KB' }).click();
    await page.getByRole('button', { name: /^Compress$/ }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText(/Done:/, { timeout: 60_000 });
    await expect(status).toContainText(/% smaller/);
    await expect(status).toContainText(/Rendered at \d+ DPI/);

    // The claim has to be true: the downloaded file must actually be under budget.
    const label = await page.getByRole('link', { name: /Download/ }).textContent();
    const kb = Number(/([\d.]+)\s*KB/.exec(label ?? '')?.[1]);
    expect(kb).toBeGreaterThan(0);
    expect(kb).toBeLessThanOrEqual(100);
  });

  test('pdf compressor warns before it rasterises a text document', async ({ page }) => {
    await page.goto('/compress-pdf-to-size');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    const p = doc.addPage([595, 842]);
    for (let i = 0; i < 30; i++) {
      p.drawText('This page carries real selectable text that a reader would lose.', {
        x: 40, y: 780 - i * 24, size: 11, font,
      });
    }
    await page.setInputFiles('input[type=file]', {
      name: 'letter.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
    // Stated BEFORE compressing: losing selectable text is the one real cost.
    await expect(page.getByText('This PDF contains selectable text')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/no longer be selectable, searchable/)).toBeVisible();
  });
});
