/**
 * What a PDF says about itself.
 *
 * A PDF's information dictionary outlives every edit: the author name from the
 * machine that made it, the software that produced it, and the times it was
 * written. People are routinely surprised by their own name in a document they
 * only ever printed to PDF, which is the reason this tool exists.
 *
 * Reading is done by pdf-lib, in this tab. Encryption is reported rather than
 * refused: knowing a file is password-protected is an answer, not a failure.
 */
import { PDFDocument } from 'pdf-lib';
import type { MetadataField } from '../metadata/read';

export interface PdfInspection {
  pageCount: number;
  encrypted: boolean;
  hasFormFields: boolean;
  fields: MetadataField[];
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const fields: MetadataField[] = [];
  const push = (label: string, value: string | Date | undefined, sensitive = false) => {
    const text = value instanceof Date ? formatDate(value) : value?.trim();
    if (text) fields.push({ label, value: text, sensitive });
  };

  // Every getter throws on a malformed entry rather than returning undefined,
  // and one bad field should not cost the reader the other nine.
  const read = <T>(get: () => T): T | undefined => {
    try {
      return get();
    } catch {
      return undefined;
    }
  };

  push('Title', read(() => doc.getTitle()));
  push('Author', read(() => doc.getAuthor()), true);
  push('Subject', read(() => doc.getSubject()));
  push('Keywords', read(() => doc.getKeywords()));
  push('Creator', read(() => doc.getCreator()), true);
  push('Producer', read(() => doc.getProducer()), true);
  push('Created', read(() => doc.getCreationDate()));
  push('Modified', read(() => doc.getModificationDate()));

  return {
    pageCount: doc.getPageCount(),
    encrypted: doc.isEncrypted,
    hasFormFields: (read(() => doc.getForm().getFields().length) ?? 0) > 0,
    fields,
  };
}

function formatDate(d: Date): string {
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ');
}
