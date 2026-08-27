import { PDFDocument } from 'pdf-lib';

// Re-exported so the merge UI keeps importing its list helpers from one place;
// the screenshot stitcher shows the same kind of reorderable list.
export { move } from '../list';

/**
 * Joining several PDFs into one.
 *
 * Unlike the compressor next door, this never rasterises anything. Pages are
 * copied object-for-object into a fresh document, so text stays selectable,
 * links stay live and nothing is re-encoded: merging is the one PDF operation
 * that can be completely lossless, and a tool that quietly flattened the pages
 * to pictures would be doing damage the user never asked for.
 *
 * The output document is new. It inherits none of the sources' metadata — no
 * author, no title, no producer, no creation date from whichever machine made
 * the originals.
 *
 * pdf-lib parses and writes entirely in this tab. Nothing is uploaded.
 */

export type ReadFailure = 'encrypted' | 'unreadable';

/** A file we could not accept, with the reason the UI needs to explain it. */
export class PdfReadError extends Error {
  constructor(readonly reason: ReadFailure) {
    super(reason === 'encrypted' ? 'This PDF is password-protected.' : 'This is not a readable PDF.');
    this.name = 'PdfReadError';
  }
}

export interface PdfSource {
  name: string;
  pageCount: number;
  /**
   * True when the file carries fill-in form fields. Copying pages leaves the
   * widgets drawn on the page but drops the fields themselves from the
   * document, so the merged copy is no longer fillable. The UI says so before
   * merging rather than letting the reader discover it in the output.
   */
  hasFormFields: boolean;
  /** Kept parsed so merging does not re-read every file from scratch. */
  doc: PDFDocument;
}

/**
 * Parse one file and measure it.
 *
 * Encryption is separated from corruption because the two have different
 * answers: an encrypted PDF is fixable by the reader (remove the password in
 * their PDF viewer), a corrupt one is not.
 */
export async function readPdf(bytes: Uint8Array, name: string): Promise<PdfSource> {
  let doc: PDFDocument;
  try {
    // Encryption is asked about rather than caught: pdf-lib's own
    // EncryptedPDFError is downlevelled to ES5, so `instanceof` is false for it
    // and the only alternative would be matching on an upstream message string.
    // Loading past the check and reading the flag is the structural answer.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new PdfReadError('unreadable');
  }
  if (doc.isEncrypted) throw new PdfReadError('encrypted');
  return { name, pageCount: doc.getPageCount(), hasFormFields: hasFormFields(doc), doc };
}

function hasFormFields(doc: PDFDocument): boolean {
  try {
    return doc.getForm().getFields().length > 0;
  } catch {
    // A damaged AcroForm is not a reason to refuse the file: its pages still
    // merge, and there is simply nothing fillable to warn about.
    return false;
  }
}

/** Every page of every source, in the order given, as one new document. */
export async function mergePdfs(sources: readonly PdfSource[]): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error('There is nothing to merge.');

  const out = await PDFDocument.create();
  for (const source of sources) {
    const pages = await out.copyPages(source.doc, source.doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

/** What to call the download: recognisably derived from the first file. */
export function mergedName(names: readonly string[]): string {
  const first = names[0];
  if (!first) return 'merged.pdf';
  return `${first.replace(/\.pdf$/i, '')}-merged.pdf`;
}
