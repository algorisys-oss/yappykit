/**
 * Removing what a PDF says about who made it.
 *
 * The image cleaner next door strips EXIF; this is the same job for documents,
 * and the file inspector is what makes it necessary: it tells people their PDF
 * names an author and the software that produced it, and until now nothing here
 * could do anything about that.
 *
 * A PDF's information dictionary survives every edit to the text, because
 * editing text touches nothing in it. It routinely carries a real name, the
 * machine's software, and two timestamps, long after the document has been
 * rewritten and passed on.
 *
 * Unlike redaction this is lossless: the pages are untouched, so text stays
 * selectable and nothing is re-encoded. Only the metadata goes.
 */
import { PDFDocument } from 'pdf-lib';

/** The fields worth naming when they are cleared. */
const FIELDS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'] as const;

export interface StrippedPdf {
  output: Uint8Array;
  /** Which fields actually held something, for the UI to report honestly. */
  removed: string[];
}

export async function stripPdfMetadata(bytes: Uint8Array): Promise<StrippedPdf> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });

  // Read first: the point is to say what was there, not just that something was.
  const read = <T>(get: () => T): T | undefined => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };
  const before: Record<string, string> = {
    Title: read(() => doc.getTitle()) ?? '',
    Author: read(() => doc.getAuthor()) ?? '',
    Subject: read(() => doc.getSubject()) ?? '',
    Keywords: read(() => doc.getKeywords()) ?? '',
    Creator: read(() => doc.getCreator()) ?? '',
    Producer: read(() => doc.getProducer()) ?? '',
  };
  const removed = FIELDS.filter((f) => (before[f] ?? '').trim() !== '');

  // Every field is written empty rather than only the ones that were set,
  // because pdf-lib fills in its own Producer and Creator on save otherwise,
  // which would replace one identifying string with another.
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');

  // The epoch rather than "now": a current timestamp is itself information
  // about when the file was handled, and pdf-lib will write something here
  // regardless.
  const epoch = new Date(0);
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);

  return { output: await doc.save({ updateFieldAppearances: false }), removed: [...removed] };
}
