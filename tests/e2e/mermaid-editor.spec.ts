import { readFile } from 'node:fs/promises';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { makeShare } from '../../src/core/diagram/share';

/**
 * Mermaid editor.
 *
 * What a unit test cannot reach: that the real editor marks the real line,
 * that the last good diagram survives a broken edit, that a link opens on top
 * of the draft without destroying it, that the exported files are the sizes
 * the buttons promise, and that a hostile diagram stays inert in a browser.
 */

// Every test loads Mermaid cold, several megabytes of script, and Firefox under
// a parallel run takes long enough over it to brush the default limits.
test.describe.configure({ timeout: 90_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

const URL = '/mermaid-editor';

async function open(page: Page, hash = '') {
  await page.goto(URL + hash);
  await expect(page.locator('[data-stage] svg')).toBeVisible({ timeout: 30_000 });
}

/** Replace the editor's text the way a person would: select all, then type. */
async function setText(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

/** The editor's text, from its rendered lines (the whole document fits on screen here). */
const editorText = (page: Page) =>
  page.locator('.cm-content .cm-line').evaluateAll((lines) => lines.map((l) => l.textContent).join('\n'));

test.beforeEach(async ({ page }) => {
  // Each test starts from the built-in example, not a draft another test left.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('yk-test-cleared')) {
      localStorage.removeItem('yappykit-mermaid-draft');
      sessionStorage.setItem('yk-test-cleared', '1');
    }
  });
});

test('draws as you type, and keeps the last good diagram while a line is broken', async ({ page }) => {
  await open(page);
  await setText(page, 'flowchart TD\n  A[Alpha] --> B[Bravo]\n');
  await expect(page.locator('[data-stage]')).toContainText('Bravo');

  await setText(page, '---\ntitle: Broken\n---\n%% a note\nflowchart TD\n  A[Alpha] --> B[Bravo]\n  B --> C[Charlie\n  C --> D\n');
  const error = page.locator('[data-error]');
  // Line 7 of the editor, which Mermaid itself calls line 3.
  await expect(error).toContainText('Line 7');
  await expect(page.locator('.cm-lintRange-error')).toHaveText(/Charlie/);
  await expect(page.locator('[data-stale]')).toBeVisible();
  await expect(page.locator('[data-stage]')).toContainText('Bravo');

  await error.getByRole('button', { name: 'Go to line 7' }).click();
  await expect(page.locator('.cm-activeLine')).toContainText('C[Charlie');

  await page.keyboard.press('End');
  await page.keyboard.insertText(']');
  await expect(error).toBeHidden();
  await expect(page.locator('[data-stage]')).toContainText('Charlie');
});

test('offers the diagram type a typo was meant to be', async ({ page }) => {
  await open(page);
  await setText(page, 'sequencediagrm\n  Alice->>Bob: Hello\n');
  const error = page.locator('[data-error]');
  await expect(error).toContainText('“sequencediagrm” isn’t a diagram type');
  await error.getByRole('button', { name: 'Change it to sequenceDiagram' }).click();
  await expect(error).toBeHidden();
  await expect(page.locator('[data-stage]')).toContainText('Alice');
});

test('opens a shared link on top of the draft, and Undo brings the draft back', async ({ page }) => {
  await open(page);
  await setText(page, 'flowchart LR\n  mine[My own draft] --> x\n');
  await expect(page.locator('[data-stage]')).toContainText('My own draft');

  const hash = await makeShare('flowchart LR\n  shared["Café 東京 👋🏽"] --> y\n');
  await page.goto(URL + '#' + hash);
  await expect(page.locator('[data-stage]')).toContainText('Café 東京', { timeout: 30_000 });
  await expect(page.locator('[data-note]')).toContainText('Opened the diagram from the link');
  // The hash is consumed, so a reload shows the draft rather than the link again.
  expect(new globalThis.URL(page.url()).hash).toBe('');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-stage]')).toContainText('My own draft');
});

test('a damaged link leaves the draft alone and says so', async ({ page }) => {
  await open(page, '#code=AAAA-not-a-diagram');
  await expect(page.locator('[data-note]')).toContainText('damaged');
  await expect(page.locator('[data-stage]')).toContainText('Order placed');
});

test('keeps a hostile diagram inert', async ({ page }) => {
  const payload = [
    'flowchart TD',
    '  %%{init: {"securityLevel": "loose", "htmlLabels": true}}%%',
    '  A["<img src=x onerror=window.__pwned=1>"] --> B["<script>window.__pwned=2</script>"]',
    '  click A call alert("x")',
    '',
  ].join('\n');
  await open(page, '#' + (await makeShare(payload)));
  await expect(page.locator('[data-stage] svg')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as { __pwned?: unknown }).__pwned)).toBeUndefined();
  await expect(page.locator('[data-stage] img, [data-stage] script, [data-stage] foreignObject')).toHaveCount(0);
});

/** Width and height from a PNG's IHDR chunk. */
function pngDims(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('exports PNG at the size its button promises, and a standalone SVG', async ({ page }) => {
  await open(page);
  await setText(page, 'pie title Pets adopted\n  "Dogs" : 3\n  "Cats" : 2\n');
  await expect(page.locator('[data-stage]')).toContainText('Dogs');

  for (const use of ['A document', 'Slides'] as const) {
    await page.getByRole('radio', { name: use }).click();
    const button = page.getByRole('button', { name: /Download PNG/ });
    const [, w, h] = /\((\d+) × (\d+)\)/.exec((await button.textContent()) ?? '')!;
    const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(dl.suggestedFilename()).toBe('pets-adopted.png');
    const png = await readFile((await dl.path())!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(pngDims(png)).toEqual({ width: Number(w), height: Number(h) });
  }

  const [svgDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download SVG' }).click(),
  ]);
  const svg = await readFile((await svgDl.path())!, 'utf8');
  expect(svg.startsWith('<?xml')).toBe(true);
  expect(svg).toMatch(/<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  expect(svg).toMatch(/background-color/);
  expect(svg).toContain('Dogs');
});

test('opening a README opens its Mermaid block', async ({ page }) => {
  await open(page);
  const readme = '# Service\n\nSome prose.\n\n```mermaid\nsequenceDiagram\n  Client->>Server: ping\n```\n';
  await page.locator('input[type=file]').setInputFiles({
    name: 'README.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(readme),
  });
  await expect(page.locator('[data-note]')).toContainText('Opened the first Mermaid diagram in README.md');
  await expect(page.locator('[data-stage]')).toContainText('Server');
  expect(await editorText(page)).toBe('sequenceDiagram\n  Client->>Server: ping\n');
});

test('an example replaces the text, and Undo brings it back', async ({ page }) => {
  await open(page);
  await setText(page, 'flowchart LR\n  keep[Keep me] --> x\n');
  await expect(page.locator('[data-stage]')).toContainText('Keep me');
  await page.getByRole('combobox', { name: 'Start from an example' }).selectOption('er');
  await expect(page.locator('[data-stage]')).toContainText('CUSTOMER');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-stage]')).toContainText('Keep me');
});

test('keeps the draft across a reload', async ({ page }) => {
  await open(page);
  await setText(page, 'flowchart LR\n  saved[Survives reload] --> x\n');
  await expect(page.locator('[data-stage]')).toContainText('Survives reload');
  await page.reload();
  await expect(page.locator('[data-stage]')).toContainText('Survives reload', { timeout: 30_000 });
});
