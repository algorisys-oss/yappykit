/**
 * Reading a ZIP's table of contents.
 *
 * Every modern office document is a ZIP, and its central directory lists what
 * is inside without decompressing a single byte: which parts exist, how big
 * they are, and whether one of them is a macro project. That is enough to
 * answer "what is in this file?" honestly and cheaply, on a phone, without
 * pulling in an inflate implementation.
 *
 * The counterpart writer is core/archive/zip.ts.
 */

const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_MIN = 22;
/** The comment field is 16 bits, so the record starts within this of the end. */
const EOCD_MAX_SEARCH = EOCD_MIN + 0xffff;
export interface ZipListingEntry {
  name: string;
  sizeBytes: number;
  compressedBytes: number;
}

export interface ZipDescription {
  kind: 'office' | 'epub' | 'archive';
  entryCount: number;
  hasMacros: boolean;
  /** The entry holding author and editing history, when the archive has one. */
  propsEntry: string;
}

export class NotAZipError extends Error {}

/** The entries listed in the archive's central directory. */
export function readZipListing(bytes: Uint8Array): ZipListingEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes.length);
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const entries: ZipListingEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new NotAZipError('central directory ended early');
    }
    const compressedBytes = view.getUint32(at + 20, true);
    const sizeBytes = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const raw = bytes.subarray(at + 46, at + 46 + nameLength);
    entries.push({
      // Names are either flagged UTF-8 or are CP437, and the two agree on
      // ASCII, which is every unflagged name worth reading.
      name: new TextDecoder().decode(raw),
      sizeBytes,
      compressedBytes,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEocd(view: DataView, length: number): number {
  const stop = Math.max(0, length - EOCD_MAX_SEARCH);
  for (let at = length - EOCD_MIN; at >= stop; at--) {
    if (view.getUint32(at, true) === EOCD_SIG) return at;
  }
  throw new NotAZipError('no end-of-central-directory record');
}

/** What the listing says the archive is. */
export function describeZip(entries: readonly ZipListingEntry[]): ZipDescription {
  const names = entries.map((e) => e.name);
  const has = (prefix: string) => names.some((n) => n.startsWith(prefix));
  const propsEntry = names.find((n) => n === 'docProps/core.xml') ?? '';

  const kind: ZipDescription['kind'] = has('META-INF/container.xml')
    ? 'epub'
    : has('word/') || has('xl/') || has('ppt/') || propsEntry
      ? 'office'
      : 'archive';

  return {
    kind,
    entryCount: entries.length,
    // The one thing in an office document that can act on its own.
    hasMacros: names.some((n) => n.toLowerCase().endsWith('vbaproject.bin')),
    propsEntry,
  };
}
