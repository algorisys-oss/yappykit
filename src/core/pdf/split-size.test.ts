import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitBySize, chunkName } from './split-size';

/** A document whose pages are identifiable by width: page n is n*10 wide. */
async function fixture(pages: number, padBytes = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([n * 10, 100]);
    // Padding gives each page real weight, so budgets mean something.
    if (padBytes) page.drawText('x'.repeat(padBytes), { size: 1 });
  }
  return doc.save();
}
const widthsOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth() / 10));

describe('splitBySize', () => {
  it('returns one part when everything already fits', async () => {
    const parts = await splitBySize(await fixture(5), 5 * 1024 * 1024, 'report.pdf');
    expect(parts).toHaveLength(1);
    expect(await widthsOf(parts[0]!.bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps every page, exactly once, in order across the parts', async () => {
    const parts = await splitBySize(await fixture(8, 400), 3000, 'report.pdf');
    const pages: number[] = [];
    for (const part of parts) pages.push(...(await widthsOf(part.bytes)));
    expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('reports which pages went into each part', async () => {
    const parts = await splitBySize(await fixture(8, 400), 3000, 'report.pdf');
    const claimed = parts.flatMap((p) => p.pages);
    expect(claimed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const part of parts) {
      expect(part.pages.length, 'a part with no pages is never useful').toBeGreaterThan(0);
    }
  });

  it('actually splits when the budget is smaller than the whole document', async () => {
    const whole = await fixture(8, 400);
    const parts = await splitBySize(whole, Math.floor(whole.byteLength / 3), 'report.pdf');
    expect(parts.length).toBeGreaterThan(1);
  });

  it('never leaves a part over budget while it could have started a new one', async () => {
    const budget = 3000;
    const parts = await splitBySize(await fixture(8, 400), budget, 'report.pdf');
    for (const part of parts) {
      // A single page too big for the budget is the one allowed exception, and
      // it is flagged rather than silently oversized.
      if (part.bytes.byteLength > budget) expect(part.oversize).toBe(true);
      else expect(part.oversize).toBe(false);
    }
  });

  it('puts a page that cannot fit on its own into its own part, and says so', async () => {
    // One byte of budget: no page can ever fit, so each becomes its own part.
    const parts = await splitBySize(await fixture(3), 1, 'report.pdf');
    expect(parts).toHaveLength(3);
    expect(parts.every((p) => p.oversize)).toBe(true);
    expect(parts.map((p) => p.pages)).toEqual([[1], [2], [3]]);
  });

  it('names the parts in order', async () => {
    const parts = await splitBySize(await fixture(3), 1, 'report.pdf');
    expect(parts.map((p) => p.name)).toEqual(['report-part1.pdf', 'report-part2.pdf', 'report-part3.pdf']);
  });

  it('reports progress as it works, so a long document is not silent', async () => {
    const seen: number[] = [];
    await splitBySize(await fixture(6, 200), 2000, 'report.pdf', (f) => seen.push(f));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeCloseTo(1, 5);
  });
});

describe('chunkName', () => {
  it('numbers the parts from one and keeps the stem', () => {
    expect(chunkName('report.pdf', 0)).toBe('report-part1.pdf');
    expect(chunkName('REPORT.PDF', 4)).toBe('REPORT-part5.pdf');
    expect(chunkName('no-extension', 0)).toBe('no-extension-part1.pdf');
  });
});
