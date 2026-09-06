import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parsePageRanges, extractPages, splitToFiles, extractedName, pageName } from './split';

describe('parsePageRanges', () => {
  const parse = (spec: string, count = 10) => parsePageRanges(spec, count);

  it('reads the single pages and the spans people actually type', () => {
    expect(parse('1-3, 7').pages).toEqual([1, 2, 3, 7]);
    expect(parse('2').pages).toEqual([2]);
    expect(parse('1,2,3').pages).toEqual([1, 2, 3]);
  });

  it('does not mind the spacing', () => {
    expect(parse('  1 - 3 ,7  ').pages).toEqual([1, 2, 3, 7]);
    expect(parse('1-3 7').pages).toEqual([1, 2, 3, 7]);
  });

  it('fills in an open end from the document', () => {
    expect(parse('8-').pages).toEqual([8, 9, 10]);
    expect(parse('-3').pages).toEqual([1, 2, 3]);
  });

  it('reads a backwards span backwards, which is how a document gets reversed', () => {
    expect(parse('3-1').pages).toEqual([3, 2, 1]);
    expect(parse('10-1').pages).toHaveLength(10);
    expect(parse('10-1').pages[0]).toBe(10);
  });

  it('keeps the order typed, and keeps a repeat, because both are deliberate', () => {
    expect(parse('7,1').pages).toEqual([7, 1]);
    expect(parse('1,1,2').pages).toEqual([1, 1, 2]);
  });

  it('refuses a page the document does not have', () => {
    expect(parse('11').error).toBe('outOfRange');
    expect(parse('0').error).toBe('outOfRange');
    expect(parse('9-12').error).toBe('outOfRange');
    expect(parse('11').pages).toEqual([]);
  });

  it('refuses something that is not a range at all', () => {
    for (const spec of ['a', '1-2-3', '1..3', '-', '1-a']) {
      expect(parse(spec).error, spec).toBe('syntax');
    }
  });

  it('says empty rather than syntax when nothing was typed', () => {
    expect(parse('').error).toBe('empty');
    expect(parse('   ').error).toBe('empty');
    expect(parse(' , ').error).toBe('empty');
  });
});

/** A document whose pages are identifiable: page n is n*10 points wide. */
async function fixture(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= pages; n++) doc.addPage([n * 10, 100]);
  return doc.save();
}
const widths = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

describe('extractPages', () => {
  it('keeps the pages asked for, in the order asked for', async () => {
    const out = await extractPages(await fixture(5), [3, 1]);
    expect(await widths(out)).toEqual([30, 10]);
  });

  it('can reverse a document, since the order is just the list', async () => {
    const out = await extractPages(await fixture(4), [4, 3, 2, 1]);
    expect(await widths(out)).toEqual([40, 30, 20, 10]);
  });

  it('copies a page twice when it is asked for twice', async () => {
    const out = await extractPages(await fixture(3), [2, 2]);
    expect(await widths(out)).toEqual([20, 20]);
  });

  it('keeps each page at its own size rather than normalising them', async () => {
    const out = await extractPages(await fixture(3), [1, 2, 3]);
    expect(await widths(out)).toEqual([10, 20, 30]);
  });

  it('refuses an empty selection rather than writing a PDF with no pages', async () => {
    await expect(extractPages(await fixture(3), [])).rejects.toThrow();
  });
});

describe('splitToFiles', () => {
  it('gives one file per page, named by the page it holds', async () => {
    const files = await splitToFiles(await fixture(3), [1, 2, 3], 'report.pdf');
    expect(files.map((f) => f.name)).toEqual(['report-p1.pdf', 'report-p2.pdf', 'report-p3.pdf']);
  });

  it('splits only the selection, not the whole document', async () => {
    const files = await splitToFiles(await fixture(5), [2, 4], 'report.pdf');
    expect(files.map((f) => f.name)).toEqual(['report-p2.pdf', 'report-p4.pdf']);
    expect(await widths(files[0]!.bytes)).toEqual([20]);
    expect(await widths(files[1]!.bytes)).toEqual([40]);
  });

  it('each file holds exactly its one page', async () => {
    const files = await splitToFiles(await fixture(3), [1, 2, 3], 'report.pdf');
    for (const f of files) expect(await widths(f.bytes)).toHaveLength(1);
  });
});

describe('naming', () => {
  it('derives a name that says what happened, without doubling the extension', () => {
    expect(extractedName('report.pdf')).toBe('report-pages.pdf');
    expect(extractedName('REPORT.PDF')).toBe('REPORT-pages.pdf');
    expect(extractedName('no-extension')).toBe('no-extension-pages.pdf');
    expect(pageName('report.pdf', 7)).toBe('report-p7.pdf');
  });
});
