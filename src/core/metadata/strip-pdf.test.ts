import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { stripPdfMetadata } from './strip-pdf';

async function made(fill: (d: PDFDocument) => void, pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  fill(doc);
  return doc.save();
}

/**
 * Reload WITHOUT letting pdf-lib touch the metadata.
 *
 * A plain `PDFDocument.load` stamps its own Producer and a fresh ModDate in the
 * constructor, so verifying a strip with default options tests the loader
 * rather than the strip, and reports a failure that is not there.
 */
const reload = (bytes: Uint8Array) => PDFDocument.load(bytes, { updateMetadata: false });

describe('stripPdfMetadata', () => {
  it('clears the fields that name a person or a machine', async () => {
    const bytes = await made((d) => {
      d.setTitle('Q3 numbers');
      d.setAuthor('Priya Raman');
      d.setSubject('Internal');
      d.setKeywords(['salary', 'confidential']);
      d.setCreator('Acme Reporting 4.2');
      d.setProducer('Acme PDF Writer');
    });

    const { output } = await stripPdfMetadata(bytes);
    const doc = await reload(output);
    expect(doc.getTitle() ?? '').toBe('');
    expect(doc.getAuthor() ?? '').toBe('');
    expect(doc.getSubject() ?? '').toBe('');
    expect(doc.getKeywords() ?? '').toBe('');
    expect(doc.getCreator() ?? '').toBe('');
    expect(doc.getProducer() ?? '').toBe('');
  });

  it('names what it removed, so the page can say', async () => {
    const bytes = await made((d) => {
      d.setAuthor('Priya Raman');
      d.setTitle('Q3 numbers');
    });
    const { removed } = await stripPdfMetadata(bytes);
    expect(removed).toContain('Author');
    expect(removed).toContain('Title');
  });

  it('does not claim to have removed a field that was never there', async () => {
    const bytes = await made((d) => d.setAuthor('Priya Raman'));
    const { removed } = await stripPdfMetadata(bytes);
    expect(removed).toContain('Author');
    expect(removed).not.toContain('Subject');
  });

  it('leaves the pages exactly as they were', async () => {
    const bytes = await made((d) => d.setAuthor('Priya Raman'), 3);
    const { output } = await stripPdfMetadata(bytes);
    const doc = await reload(output);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([200, 200, 200]);
  });

  it('clears the dates, which are as identifying as the names', async () => {
    const bytes = await made((d) => {
      d.setCreationDate(new Date('2020-01-02T03:04:05Z'));
      d.setModificationDate(new Date('2021-06-07T08:09:10Z'));
    });
    const { output } = await stripPdfMetadata(bytes);
    const raw = new TextDecoder('latin1').decode(output);
    expect(raw).not.toContain('20200102');
    expect(raw).not.toContain('20210607');
  });

  it('does not leave the author name anywhere in the bytes', async () => {
    // The real test: not what the getters report, but what the file contains.
    const bytes = await made((d) => d.setAuthor('Priya Raman'));
    const { output } = await stripPdfMetadata(bytes);
    expect(new TextDecoder('latin1').decode(output)).not.toContain('Priya Raman');
  });

  it('reports nothing removed for a document that carried nothing', async () => {
    const bytes = await made(() => {});
    const { removed } = await stripPdfMetadata(bytes);
    expect(removed.filter((f) => f !== 'Producer' && f !== 'Creator')).toEqual([]);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(stripPdfMetadata(new TextEncoder().encode('nope'))).rejects.toThrow();
  });
});
