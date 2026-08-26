import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFHexString } from 'pdf-lib';
import { readPdf, mergePdfs, move, mergedName, PdfReadError } from './merge';

/** A PDF whose pages have distinct sizes, so page order is observable. */
async function makePdf(sizes: [number, number][], meta?: { author?: string; title?: string }) {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) doc.addPage([w, h]);
  if (meta?.author) doc.setAuthor(meta.author);
  if (meta?.title) doc.setTitle(meta.title);
  return doc.save();
}

async function sizesOf(bytes: Uint8Array): Promise<[number, number][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
}

async function source(name: string, sizes: [number, number][], meta?: { author?: string; title?: string }) {
  return readPdf(await makePdf(sizes, meta), name);
}

/** A one-page PDF carrying a fill-in text field. */
async function makeFormPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const field = doc.getForm().createTextField('applicant.name');
  field.setText('Jane Smith');
  field.addToPage(page, { x: 20, y: 200, width: 200, height: 24 });
  return doc.save();
}

describe('readPdf', () => {
  it('reports the page count and keeps the name', async () => {
    const s = await source('scan.pdf', [[200, 200], [300, 300]]);
    expect(s.pageCount).toBe(2);
    expect(s.name).toBe('scan.pdf');
  });

  it('notices fill-in form fields, which a merge cannot keep', async () => {
    expect((await readPdf(await makeFormPdf(), 'form.pdf')).hasFormFields).toBe(true);
    expect((await source('plain.pdf', [[200, 200]])).hasFormFields).toBe(false);
  });

  it('rejects a file that is not a PDF', async () => {
    const notPdf = new TextEncoder().encode('this is a text file, not a document');
    await expect(readPdf(notPdf, 'notes.txt')).rejects.toMatchObject({ reason: 'unreadable' });
  });

  it('rejects a password-protected PDF by name, so the UI can say so', async () => {
    // pdf-lib cannot encrypt, so the fixture declares encryption in its trailer
    // instead. Checked against a genuinely encrypted file (ghostscript, RC4-128):
    // both are detected the same way, by the /Encrypt entry.
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.context.trailerInfo.Encrypt = doc.context.obj({
      Filter: 'Standard',
      V: 1,
      R: 2,
      O: PDFHexString.of('00'.repeat(32)),
      U: PDFHexString.of('00'.repeat(32)),
      P: -1,
    });
    const encrypted = await doc.save();
    await expect(readPdf(encrypted, 'locked.pdf')).rejects.toBeInstanceOf(PdfReadError);
    await expect(readPdf(encrypted, 'locked.pdf')).rejects.toMatchObject({ reason: 'encrypted' });
  });
});

describe('mergePdfs', () => {
  it('concatenates every page in list order', async () => {
    const a = await source('a.pdf', [[100, 100]]);
    const b = await source('b.pdf', [[200, 200], [250, 250]]);
    const c = await source('c.pdf', [[300, 300]]);

    expect(await sizesOf(await mergePdfs([a, b, c]))).toEqual([
      [100, 100], [200, 200], [250, 250], [300, 300],
    ]);
  });

  it('follows the order it is given, not the order the files were read', async () => {
    const a = await source('a.pdf', [[100, 100]]);
    const b = await source('b.pdf', [[200, 200]]);
    expect(await sizesOf(await mergePdfs([b, a]))).toEqual([[200, 200], [100, 100]]);
  });

  it('merges one file into a copy of itself', async () => {
    const a = await source('a.pdf', [[100, 100], [110, 110]]);
    expect(await sizesOf(await mergePdfs([a]))).toEqual([[100, 100], [110, 110]]);
  });

  it('carries none of the sources metadata into the merged file', async () => {
    const a = await source('a.pdf', [[100, 100]], { author: 'Jane Smith', title: 'Payslip' });
    const out = await PDFDocument.load(await mergePdfs([a]));
    expect(out.getAuthor()).toBeUndefined();
    expect(out.getTitle()).toBeUndefined();
    expect(out.getSubject()).toBeUndefined();
    expect(out.getKeywords()).toBeUndefined();
  });

  it('loses interactive form fields, which is what the warning promises', async () => {
    // Pinned deliberately: the UI warns about this before merging, so if a
    // pdf-lib upgrade ever starts carrying fields across, the warning is what
    // needs correcting.
    const form = await readPdf(await makeFormPdf(), 'form.pdf');
    const out = await PDFDocument.load(await mergePdfs([form, form]));
    expect(out.getForm().getFields()).toHaveLength(0);
  });

  it('refuses to build a PDF with no pages', async () => {
    await expect(mergePdfs([])).rejects.toThrow();
  });
});

describe('move', () => {
  it('moves an item down the list', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item up the list', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone when the move runs off either end', () => {
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(move(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });

  it('never mutates the list it was given', () => {
    const list = ['a', 'b'];
    move(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('mergedName', () => {
  it('names the output after the first file', () => {
    expect(mergedName(['invoice-jan.pdf', 'invoice-feb.pdf'])).toBe('invoice-jan-merged.pdf');
  });

  it('copes with a name that has no extension', () => {
    expect(mergedName(['scan'])).toBe('scan-merged.pdf');
  });

  it('falls back when there is nothing to name it after', () => {
    expect(mergedName([])).toBe('merged.pdf');
  });
});
