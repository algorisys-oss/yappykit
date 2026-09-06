/**
 * Taking a PDF apart: keeping some pages, putting them in an order, or writing
 * one file per page.
 *
 * Like the merger next door and unlike the compressor, this is lossless. Pages
 * are copied object for object into a new document, so text stays selectable,
 * links keep working and each page keeps its own size. A page is never
 * re-rendered.
 *
 * The selection is expressed the way a print dialog does it, because that is
 * the notation everyone already knows: `1-3, 7`. Two deliberate extensions:
 * an open end (`8-` means to the last page) and a backwards span (`10-1`),
 * which is how a document gets reversed without a hundred clicks.
 */
import { PDFDocument } from 'pdf-lib';

export type RangeError = 'empty' | 'syntax' | 'outOfRange';

export interface ParsedRanges {
  /** 1-based page numbers, in the order given. Empty when `error` is set. */
  pages: number[];
  error: RangeError | null;
}

/** One item of the list: `7`, `1-3`, `8-`, `-3`. */
const ITEM = /^(\d*)(?:-(\d*))?$/;

/**
 * Parse a print-dialog page selection.
 *
 * Order and repeats are preserved rather than normalised: `7,1` means page 7
 * then page 1, and `1,1` really does mean the page twice. Both are the whole
 * point of the tool, so sorting or de-duplicating here would quietly discard
 * what the user asked for.
 */
export function parsePageRanges(spec: string, pageCount: number): ParsedRanges {
  // "1 - 3" is one span, not the three items a naive split would make of it,
  // so the spaces hugging a dash go before anything else is decided.
  const items = spec.replace(/\s*-\s*/g, '-').split(/[,\s]+/).filter((s) => s.length > 0);
  if (items.length === 0) return { pages: [], error: 'empty' };

  const pages: number[] = [];
  for (const item of items) {
    const m = ITEM.exec(item);
    if (!m) return { pages: [], error: 'syntax' };

    const [, rawFrom, rawTo] = m;
    const open = item.includes('-');
    // `-` on its own says nothing, and a bare `` cannot happen after the filter.
    if (!open && !rawFrom) return { pages: [], error: 'syntax' };
    if (open && !rawFrom && !rawTo) return { pages: [], error: 'syntax' };

    const from = rawFrom ? Number(rawFrom) : 1;
    const to = open ? (rawTo ? Number(rawTo) : pageCount) : from;

    if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
      return { pages: [], error: 'outOfRange' };
    }
    const step = to >= from ? 1 : -1;
    for (let n = from; step > 0 ? n <= to : n >= to; n += step) pages.push(n);
  }
  return { pages, error: null };
}

/** The selected pages, in the order given, as one new document. */
export async function extractPages(bytes: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('There are no pages to keep.');
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  // copyPages takes 0-based indices; everything the user sees is 1-based.
  const copied = await out.copyPages(source, pages.map((n) => n - 1));
  for (const page of copied) out.addPage(page);
  return out.save();
}

export interface SplitFile {
  name: string;
  bytes: Uint8Array;
}

/** One single-page document per selected page. */
export async function splitToFiles(
  bytes: Uint8Array,
  pages: readonly number[],
  sourceName: string,
): Promise<SplitFile[]> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const files: SplitFile[] = [];
  for (const n of pages) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(source, [n - 1]);
    out.addPage(page);
    files.push({ name: pageName(sourceName, n), bytes: await out.save() });
  }
  return files;
}

const stem = (name: string) => name.replace(/\.pdf$/i, '');

/** What to call a selection taken out of `name`. */
export function extractedName(name: string): string {
  return `${stem(name)}-pages.pdf`;
}

/** What to call the single-page file holding page `n` of `name`. */
export function pageName(name: string, n: number): string {
  return `${stem(name)}-p${n}.pdf`;
}
