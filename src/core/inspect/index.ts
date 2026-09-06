/**
 * "What is in this file?"
 *
 * One read, one answer: what the bytes really are, what the name claims, and
 * whatever the file carries that its owner did not put there on purpose — the
 * GPS point in a photo, the author name in a PDF, the macro project in a
 * spreadsheet. Nothing is uploaded; every reader here runs in the tab.
 *
 * Findings are reported as codes rather than sentences so the copy can be
 * translated (see the route). The deep readers live next door: sniff.ts,
 * pdf.ts, zip-read.ts.
 */
import { decodeImage } from '../image/canvas-codec';
import { readMetadata, type MetadataField } from '../metadata/read';
import { inspectPdf } from './pdf';
import { sniff, extensionMismatch, type FileFormat } from './sniff';
import { describeZip, readZipListing, type ZipDescription } from './zip-read';

/** Enough bytes for every signature in sniff.ts. */
const HEAD_BYTES = 64;

export type Finding =
  | 'mismatch'
  | 'gps'
  | 'author'
  | 'macros'
  | 'encrypted'
  | 'formFields'
  | 'unknownType';

export interface Inspection {
  name: string;
  sizeBytes: number;
  format: FileFormat | null;
  /** The extension the name claims, lower case and without the dot. */
  claimedExt: string;
  fields: MetadataField[];
  dimensions: { width: number; height: number } | null;
  pdf: { pageCount: number; encrypted: boolean; hasFormFields: boolean } | null;
  zip: ZipDescription | null;
  findings: Finding[];
}

/** The extension a name claims, or '' when it makes no claim. */
export function claimedExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export async function inspect(file: File): Promise<Inspection> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const format = sniff(head);
  const findings: Finding[] = [];
  if (!format) findings.push('unknownType');
  if (extensionMismatch(file.name, format)) findings.push('mismatch');

  const report: Inspection = {
    name: file.name,
    sizeBytes: file.size,
    format,
    claimedExt: claimedExtension(file.name),
    fields: [],
    dimensions: null,
    pdf: null,
    zip: null,
    findings,
  };

  const mime = format?.mime ?? '';
  if (mime.startsWith('image/')) await readImage(file, report);
  else if (mime === 'application/pdf') await readPdf(file, report);
  else if (mime === 'application/zip') await readZip(file, report);

  return report;
}

async function readImage(file: File, report: Inspection): Promise<void> {
  const meta = await readMetadata(file).catch(() => null);
  if (meta) {
    report.fields = meta.fields;
    if (meta.hasGps) report.findings.push('gps');
    if (meta.fields.some((f) => f.label === 'Artist')) report.findings.push('author');
  }
  // A HEIC decode costs a WASM download, and the pixel size is not worth it.
  if (report.format?.mime === 'image/heic') return;
  try {
    const decoded = await decodeImage(file);
    report.dimensions = { width: decoded.width, height: decoded.height };
    decoded.close();
  } catch {
    // An image the browser cannot decode still has a type, a size and metadata.
  }
}

async function readPdf(file: File, report: Inspection): Promise<void> {
  const info = await inspectPdf(new Uint8Array(await file.arrayBuffer())).catch(() => null);
  if (!info) return;
  report.pdf = { pageCount: info.pageCount, encrypted: info.encrypted, hasFormFields: info.hasFormFields };
  report.fields = info.fields;
  if (info.encrypted) report.findings.push('encrypted');
  if (info.hasFormFields) report.findings.push('formFields');
  if (info.fields.some((f) => f.label === 'Author')) report.findings.push('author');
}

async function readZip(file: File, report: Inspection): Promise<void> {
  try {
    const entries = readZipListing(new Uint8Array(await file.arrayBuffer()));
    report.zip = describeZip(entries);
    if (report.zip.hasMacros) report.findings.push('macros');
  } catch {
    // A truncated or spanned archive: the type and size still stand.
  }
}
