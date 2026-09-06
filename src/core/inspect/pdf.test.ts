import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { inspectPdf } from './pdf';

async function makePdf(fill: (doc: PDFDocument) => void, pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  fill(doc);
  return doc.save();
}

describe('inspectPdf', () => {
  it('counts the pages', async () => {
    const r = await inspectPdf(await makePdf(() => {}, 3));
    expect(r.pageCount).toBe(3);
  });

  it('surfaces the names a document carries around', async () => {
    const bytes = await makePdf((d) => {
      d.setTitle('Q3 numbers');
      d.setAuthor('Priya Raman');
      d.setCreator('Acme Reporting 4.2');
      d.setSubject('Internal');
    });
    const fields = await inspectPdf(bytes).then((r) => r.fields);
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]));
    expect(byLabel.Title).toBe('Q3 numbers');
    expect(byLabel.Author).toBe('Priya Raman');
    expect(byLabel.Creator).toBe('Acme Reporting 4.2');
    expect(byLabel.Subject).toBe('Internal');
  });

  it('marks the person and the software as the sensitive ones', async () => {
    const bytes = await makePdf((d) => {
      d.setAuthor('Priya Raman');
      d.setTitle('Q3 numbers');
    });
    const fields = await inspectPdf(bytes).then((r) => r.fields);
    expect(fields.find((f) => f.label === 'Author')?.sensitive).toBe(true);
    expect(fields.find((f) => f.label === 'Title')?.sensitive).toBeFalsy();
  });

  it('lists no empty fields for a document that carries nothing', async () => {
    const bytes = await makePdf((d) => {
      d.setProducer('');
      d.setCreator('');
    });
    const r = await inspectPdf(bytes);
    expect(r.fields.every((f) => f.value !== '')).toBe(true);
  });

  it('reports form fields, which travel with whatever was typed into them', async () => {
    const bytes = await makePdf((d) => {
      const form = d.getForm();
      form.createTextField('applicant.name').addToPage(d.getPage(0), { x: 10, y: 10, width: 100, height: 20 });
    });
    expect((await inspectPdf(bytes)).hasFormFields).toBe(true);
    expect((await inspectPdf(await makePdf(() => {}))).hasFormFields).toBe(false);
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(inspectPdf(new TextEncoder().encode('nope'))).rejects.toThrow();
  });
});
