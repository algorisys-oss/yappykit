/**
 * Splitting a PDF into parts that each fit a byte budget.
 *
 * The obvious approach, dividing the page count by the number of parts you
 * want, does not work: pages are not the same size as each other, and a PDF is
 * not the sum of its pages anyway. Fonts and images are shared objects, the
 * cross-reference table grows with the object count, and a page that costs
 * 40 KB alongside its neighbours may cost 300 KB on its own because it now has
 * to carry the font it was borrowing.
 *
 * So this measures rather than predicts. Pages are added to a part one at a
 * time and the part is actually serialised after each one; when it no longer
 * fits, the page that broke it starts the next part. That is more work than
 * arithmetic and it is the only way to make a promise about bytes and keep it.
 *
 * Splitting is lossless throughout. Pages are copied object for object, so text
 * stays selectable and nothing is re-encoded.
 */
import { PDFDocument } from 'pdf-lib';

export interface SizeChunk {
  name: string;
  bytes: Uint8Array;
  /** 1-based page numbers this part holds, in order. */
  pages: number[];
  /**
   * True when the part exceeds the budget anyway, which happens only for a
   * single page too large to fit alone. Splitting a page is not possible
   * without rasterising it, and doing that silently would break the promise
   * that this tool never re-encodes anything.
   */
  oversize: boolean;
}

/** `report.pdf` part 1 becomes `report-part1.pdf`. */
export function chunkName(sourceName: string, index: number): string {
  const stem = sourceName.replace(/\.pdf$/i, '');
  return `${stem}-part${index + 1}.pdf`;
}

/**
 * Split into parts that each fit `budgetBytes`.
 *
 * `onProgress` fires per page: every page costs a serialisation, so a long
 * document takes long enough that a silent UI reads as a hang.
 */
export async function splitBySize(
  source: Uint8Array,
  budgetBytes: number,
  sourceName: string,
  onProgress?: (fraction: number) => void,
): Promise<SizeChunk[]> {
  const doc = await PDFDocument.load(source, { ignoreEncryption: true });
  const total = doc.getPageCount();
  if (total === 0) throw new Error('This PDF has no pages.');

  const chunks: SizeChunk[] = [];
  let current = await PDFDocument.create();
  let currentPages: number[] = [];
  let lastGoodBytes: Uint8Array | null = null;

  const flush = (bytes: Uint8Array, pages: number[]) => {
    chunks.push({
      name: chunkName(sourceName, chunks.length),
      bytes,
      pages,
      oversize: bytes.byteLength > budgetBytes,
    });
  };

  for (let i = 0; i < total; i++) {
    const [copied] = await current.copyPages(doc, [i]);
    current.addPage(copied);
    currentPages.push(i + 1);
    const bytes = await current.save();

    if (bytes.byteLength <= budgetBytes || currentPages.length === 1) {
      // Still fits, or it is a single page that cannot be split any further.
      lastGoodBytes = bytes;
    } else {
      // This page broke the budget: close the part without it and start again.
      flush(lastGoodBytes!, currentPages.slice(0, -1));
      current = await PDFDocument.create();
      const [again] = await current.copyPages(doc, [i]);
      current.addPage(again);
      currentPages = [i + 1];
      lastGoodBytes = await current.save();
    }
    onProgress?.((i + 1) / total);
  }

  if (lastGoodBytes) flush(lastGoodBytes, currentPages);
  return chunks;
}
