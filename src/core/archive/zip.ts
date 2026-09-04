/**
 * A ZIP writer, store only.
 *
 * Every batch tool here hands back files that are already compressed — JPEG,
 * PNG, WebP — so deflating them costs CPU on a phone and saves nothing. Storing
 * them means the archive is the files plus about a hundred bytes of structure
 * each, and the writer is small enough to read in one sitting, which is why
 * there is no dependency here.
 *
 * Timestamps are fixed at the DOS epoch rather than taken from the clock: the
 * same batch then produces the same archive byte for byte, and the file carries
 * nothing about when or where it was made.
 */

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** 2.0: the version that defined the features used here. */
const VERSION = 20;
/** General purpose bit 11 — the name is UTF-8. */
const UTF8_FLAG = 0x0800;
const STORED = 0;
/** 1 January 1980, the earliest a DOS date can express. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const named = entries.map((e) => ({ ...e, name: encoder.encode(e.name), crc: crc32(e.bytes) }));

  const localSize = named.reduce((n, e) => n + 30 + e.name.length + e.bytes.length, 0);
  const centralSize = named.reduce((n, e) => n + 46 + e.name.length, 0);

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  const u32 = (v: number) => {
    view.setUint32(at, v >>> 0, true);
    at += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const raw = (b: Uint8Array) => {
    out.set(b, at);
    at += b.length;
  };

  const offsets: number[] = [];
  for (const e of named) {
    offsets.push(at);
    u32(LOCAL_SIG);
    u16(VERSION);
    u16(UTF8_FLAG);
    u16(STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.bytes.length);
    u32(e.bytes.length);
    u16(e.name.length);
    u16(0);
    raw(e.name);
    raw(e.bytes);
  }

  const centralStart = at;
  for (let i = 0; i < named.length; i++) {
    const e = named[i]!;
    u32(CENTRAL_SIG);
    u16(VERSION);
    u16(VERSION);
    u16(UTF8_FLAG);
    u16(STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.bytes.length);
    u32(e.bytes.length);
    u16(e.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i]!);
    raw(e.name);
  }

  // Measured before the record is written, because `at` moves as it is.
  const centralBytes = at - centralStart;
  u32(EOCD_SIG);
  u16(0);
  u16(0);
  u16(named.length);
  u16(named.length);
  u32(centralBytes);
  u32(centralStart);
  u16(0);

  return out;
}

/**
 * Make a list of filenames unique, in place in the list.
 *
 * Two photographs from different folders routinely arrive with the same name,
 * and an archive holding two entries called IMG_0042.jpg unpacks to one file in
 * most tools, silently.
 */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
    // A leading dot is a dotfile, not an empty stem with an extension.
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 2; ; n++) {
      const candidate = `${stem}-${n}${ext}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  });
}
