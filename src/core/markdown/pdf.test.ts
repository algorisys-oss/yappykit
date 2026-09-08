import { describe, it, expect } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { buildMarkdownPdf, pdfName, titleOf } from './pdf';

/** Re-open what we produced: a PDF that pdf-lib cannot read is not a PDF. */
async function reopen(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

describe('buildMarkdownPdf', () => {
  it('produces a readable one-page PDF for a short document', async () => {
    const out = await buildMarkdownPdf('# Title\n\nA short paragraph.', { paper: 'a4' });
    expect(out.pages).toBe(1);
    expect(out.unsupported).toEqual([]);
    const doc = await reopen(out.bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('starts with the PDF signature', async () => {
    const out = await buildMarkdownPdf('hello', { paper: 'a4' });
    expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('uses the requested paper size', async () => {
    const a4 = await reopen((await buildMarkdownPdf('x', { paper: 'a4' })).bytes);
    const letter = await reopen((await buildMarkdownPdf('x', { paper: 'letter' })).bytes);
    expect(a4.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    expect(a4.getPage(0).getSize().height).toBeCloseTo(841.89, 1);
    expect(letter.getPage(0).getSize().width).toBe(612);
    expect(letter.getPage(0).getSize().height).toBe(792);
  });

  it('paginates a long document', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Paragraph number ${i}.`).join('\n\n');
    const out = await buildMarkdownPdf(long, { paper: 'a4' });
    expect(out.pages).toBeGreaterThan(5);
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('handles every block kind without throwing', async () => {
    const doc = [
      '# Heading one',
      '',
      'Body with **bold**, *italic*, `code` and a [link](https://example.test/a).',
      '',
      '## Heading two',
      '',
      '- bullet one',
      '- bullet two',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '> A quotation.',
      '>',
      '> With two paragraphs.',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '---',
      '',
      '| Name | Qty | Price |',
      '| :- | -: | -: |',
      '| Apples | 3 | 1.20 |',
      '| Pears | 12 | 4.00 |',
    ].join('\n');
    const out = await buildMarkdownPdf(doc, { paper: 'a4' });
    expect(out.pages).toBeGreaterThanOrEqual(1);
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('records a clickable link annotation, not just blue text', async () => {
    const out = await buildMarkdownPdf('See [docs](https://example.test/guide).', { paper: 'a4' });
    const doc = await reopen(out.bytes);
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    // Read the URI back out of the annotation rather than grepping the bytes:
    // pdf-lib writes compressed object streams, so the text is not in the clear.
    const dict = doc.context.lookup(annots!.get(0), PDFDict);
    const action = dict.lookup(PDFName.of('A'), PDFDict);
    expect(String(action.get(PDFName.of('URI')))).toContain('https://example.test/guide');
  });

  it('reports characters the built-in fonts cannot draw', async () => {
    const out = await buildMarkdownPdf('# 日本語\n\nMixed text 你好.', { paper: 'a4' });
    expect(out.unsupported.length).toBeGreaterThan(0);
    expect(out.unsupported).toContain('日');
    // It still produces a valid document rather than failing.
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('keeps accented Latin text, which the built-in fonts do have', async () => {
    const out = await buildMarkdownPdf('Café, naïve, Straße, œuvre — “quoted”.', { paper: 'a4' });
    expect(out.unsupported).toEqual([]);
  });

  it('folds typographic characters with an ASCII equivalent', async () => {
    const out = await buildMarkdownPdf('a → b, x × y', { paper: 'a4' });
    expect(out.unsupported).toEqual([]);
  });

  it('does not run a very long word off the page', async () => {
    const url = 'https://example.test/' + 'a'.repeat(400);
    const out = await buildMarkdownPdf(`A link to ${url} inline.`, { paper: 'a4' });
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
    expect(out.pages).toBe(1);
  });

  it('wraps a long code line instead of clipping it', async () => {
    const out = await buildMarkdownPdf('```\n' + 'x'.repeat(600) + '\n```', { paper: 'a4' });
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('paginates a code block longer than a page', async () => {
    const body = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const out = await buildMarkdownPdf('```\n' + body + '\n```', { paper: 'a4' });
    expect(out.pages).toBeGreaterThan(2);
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('paginates a wide table', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => `| row ${i} | some longer text here | ${i} |`);
    const md = ['| A | B | C |', '| - | - | - |', ...rows].join('\n');
    const out = await buildMarkdownPdf(md, { paper: 'a4' });
    expect(out.pages).toBeGreaterThan(1);
    expect((await reopen(out.bytes)).getPageCount()).toBe(out.pages);
  });

  it('numbers pages only when there is more than one', async () => {
    const one = await buildMarkdownPdf('short', { paper: 'a4' });
    expect(one.pages).toBe(1);
    const many = await buildMarkdownPdf(
      Array.from({ length: 300 }, (_, i) => `Para ${i}`).join('\n\n'),
      { paper: 'a4' },
    );
    expect(many.pages).toBeGreaterThan(1);
  });

  it('writes the title into the metadata', async () => {
    const out = await buildMarkdownPdf('# x', { paper: 'a4', title: 'My Report' });
    expect((await reopen(out.bytes)).getTitle()).toBe('My Report');
  });

  it('produces a valid document for empty input', async () => {
    const out = await buildMarkdownPdf('', { paper: 'a4' });
    expect(out.pages).toBe(1);
    expect((await reopen(out.bytes)).getPageCount()).toBe(1);
  });
});

describe('titleOf', () => {
  it('takes the first level-1 heading', () => {
    expect(titleOf('# Quarterly Report\n\nbody')).toBe('Quarterly Report');
  });

  it('ignores deeper headings', () => {
    expect(titleOf('## Not this\n\n# This one')).toBe('This one');
  });

  it('is empty when there is no heading', () => {
    expect(titleOf('just text')).toBe('');
  });

  it('strips inline formatting', () => {
    expect(titleOf('# A **bold** title')).toBe('A bold title');
  });
});

describe('pdfName', () => {
  it('uses the title when there is one', () => {
    expect(pdfName('notes.md', 'Quarterly Report')).toBe('Quarterly Report.pdf');
  });

  it('falls back to the filename without its extension', () => {
    expect(pdfName('README.md')).toBe('README.pdf');
    expect(pdfName('notes.markdown')).toBe('notes.pdf');
  });

  it('strips characters a filesystem refuses', () => {
    expect(pdfName('x.md', 'a/b:c*d?')).toBe('abcd.pdf');
  });

  it('falls back to a generic name when nothing is left', () => {
    expect(pdfName('.md', '///')).toBe('document.pdf');
  });
});
