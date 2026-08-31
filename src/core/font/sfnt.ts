/**
 * Reading the parts of a font file we actually need.
 *
 * The question this tool answers — can this font draw this character — is
 * answered exactly by one table inside the font binary (`cmap`) and asked about
 * a font the user recognises by another (`name`). Nothing else in the file
 * matters here, and the files are big: a CJK font is routinely 20 MB and a
 * machine can have hundreds installed.
 *
 * So nothing is ever loaded whole. A font is addressed through a ByteSource,
 * which for an installed font is a Blob and reads a range straight off disk.
 * Opening a font costs the header plus the table directory, a few hundred
 * bytes, and reading its coverage costs one more range read. That is the
 * difference between scanning 400 fonts and running the tab out of memory.
 *
 * Containers handled: bare sfnt (.ttf/.otf), TrueType collections (.ttc, several
 * fonts in one file), and WOFF, whose tables are individually zlib-compressed
 * and so can still be pulled out one at a time. WOFF2 is refused by name: its
 * tables are Brotli-compressed as a single stream, and browsers expose no
 * Brotli decoder to script (DecompressionStream does gzip and deflate only).
 */

export interface ByteSource {
  readonly size: number;
  /** Bytes [offset, offset+length). Returns fewer only at end of file. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function bytesSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      return bytes.subarray(offset, Math.min(offset + length, bytes.length));
    },
  };
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const slice = blob.slice(offset, Math.min(offset + length, blob.size));
      return new Uint8Array(await slice.arrayBuffer());
    },
  };
}

export type FontFormat = 'sfnt' | 'collection' | 'woff' | 'woff2' | 'unknown';

/** Why a file could not be read, in terms the UI can put to the user. */
export type FontFormatCode = 'woff2' | 'unknown' | 'damaged';

export class FontFormatError extends Error {
  constructor(readonly code: FontFormatCode) {
    super(`font format: ${code}`);
    this.name = 'FontFormatError';
  }
}

const SFNT_VERSIONS = new Set([
  0x00010000, // TrueType outlines
  0x74727565, // 'true' — the old Apple TrueType tag
  0x4f54544f, // 'OTTO' — PostScript (CFF) outlines
]);

export function sniffFormat(head: Uint8Array): FontFormat {
  if (head.length < 4) return 'unknown';
  const tag = u32(head, 0);
  if (SFNT_VERSIONS.has(tag)) return 'sfnt';
  if (tag === 0x74746366) return 'collection'; // 'ttcf'
  if (tag === 0x774f4646) return 'woff'; // 'wOFF'
  if (tag === 0x774f4632) return 'woff2'; // 'wOF2'
  return 'unknown';
}

export interface FontResource {
  has(tag: string): boolean;
  /** The table's bytes, or null when the font does not carry that table. */
  read(tag: string): Promise<Uint8Array | null>;
}

/**
 * Every font in the file. A bare font yields one; a collection yields one per
 * member, in file order.
 */
export async function openFonts(src: ByteSource): Promise<FontResource[]> {
  const head = await src.read(0, 12);
  switch (sniffFormat(head)) {
    case 'sfnt':
      return [await openSfnt(src, 0)];
    case 'collection':
      return openCollection(src, head);
    case 'woff':
      return [await openWoff(src)];
    case 'woff2':
      throw new FontFormatError('woff2');
    case 'unknown':
      throw new FontFormatError('unknown');
  }
}

interface Entry {
  offset: number;
  length: number;
  /** Bytes on disk when the container compresses tables. WOFF only. */
  compressedLength: number;
}

async function openSfnt(src: ByteSource, base: number): Promise<FontResource> {
  const header = await src.read(base, 12);
  if (header.length < 12) throw new FontFormatError('damaged');
  const numTables = u16(header, 4);

  const dirBytes = numTables * 16;
  const dir = await src.read(base + 12, dirBytes);
  if (dir.length < dirBytes) throw new FontFormatError('damaged');

  const entries = new Map<string, Entry>();
  for (let i = 0; i < numTables; i++) {
    const at = i * 16;
    const offset = u32(dir, at + 8);
    const length = u32(dir, at + 12);
    if (offset + length > src.size) throw new FontFormatError('damaged');
    entries.set(tagAt(dir, at), { offset, length, compressedLength: length });
  }
  return plainResource(src, entries);
}

async function openCollection(src: ByteSource, head: Uint8Array): Promise<FontResource[]> {
  const numFonts = u32(head, 8);
  // A collection with an implausible font count is a corrupt file, not a font
  // with 4 billion members. Bail before allocating for it.
  if (numFonts === 0 || numFonts > 1024) throw new FontFormatError('damaged');

  const offsets = await src.read(12, numFonts * 4);
  if (offsets.length < numFonts * 4) throw new FontFormatError('damaged');

  const out: FontResource[] = [];
  for (let i = 0; i < numFonts; i++) out.push(await openSfnt(src, u32(offsets, i * 4)));
  return out;
}

async function openWoff(src: ByteSource): Promise<FontResource> {
  const header = await src.read(0, 44);
  if (header.length < 44) throw new FontFormatError('damaged');
  const numTables = u16(header, 12);

  const dirBytes = numTables * 20;
  const dir = await src.read(44, dirBytes);
  if (dir.length < dirBytes) throw new FontFormatError('damaged');

  const entries = new Map<string, Entry>();
  for (let i = 0; i < numTables; i++) {
    const at = i * 20;
    const offset = u32(dir, at + 4);
    const compressedLength = u32(dir, at + 8);
    const length = u32(dir, at + 12);
    if (offset + compressedLength > src.size) throw new FontFormatError('damaged');
    entries.set(tagAt(dir, at), { offset, length, compressedLength });
  }

  return {
    has: (tag) => entries.has(tag),
    async read(tag) {
      const entry = entries.get(tag);
      if (!entry) return null;
      const raw = await src.read(entry.offset, entry.compressedLength);
      // A table the encoder could not shrink is stored as-is; the spec signals
      // that by making the two lengths equal rather than by a flag.
      if (entry.compressedLength >= entry.length) return raw.subarray(0, entry.length);
      return inflate(raw);
    },
  };
}

function plainResource(src: ByteSource, entries: Map<string, Entry>): FontResource {
  return {
    has: (tag) => entries.has(tag),
    async read(tag) {
      const entry = entries.get(tag);
      if (!entry) return null;
      return src.read(entry.offset, entry.length);
    },
  };
}

/** zlib, as WOFF stores it. 'deflate' is the zlib wrapper; 'deflate-raw' is not. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  void writer.write(bytes as BufferSource).catch(() => {});
  void writer.close().catch(() => {});

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    throw new FontFormatError('damaged');
  }

  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export interface FontNames {
  family: string;
  style: string;
  fullName: string;
}

const NAME_FAMILY = 1;
const NAME_STYLE = 2;
const NAME_FULL = 4;
const NAME_TYPO_FAMILY = 16;
const NAME_TYPO_STYLE = 17;

/**
 * The font's own names, out of the `name` table.
 *
 * A font file carries the same name several times over, once per platform and
 * language, and they disagree. We take the English Windows record where there
 * is one, because that is the name the operating system's font menu shows and
 * therefore the name the user is looking for in this list.
 */
export function readNames(table: Uint8Array): FontNames {
  if (table.length < 6) return { family: '', style: '', fullName: '' };
  const count = u16(table, 2);
  const storage = u16(table, 4);

  const best = new Map<number, { score: number; value: string }>();
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    if (at + 12 > table.length) break;
    const platform = u16(table, at);
    const encoding = u16(table, at + 2);
    const language = u16(table, at + 4);
    const nameId = u16(table, at + 6);
    const length = u16(table, at + 8);
    const offset = storage + u16(table, at + 10);
    if (offset + length > table.length) continue;

    const score = scoreRecord(platform, encoding, language);
    if (score === 0) continue;
    const current = best.get(nameId);
    if (current && current.score >= score) continue;
    const value = decodeName(table.subarray(offset, offset + length), platform).trim();
    if (value) best.set(nameId, { score, value });
  }

  const pick = (...ids: number[]) => ids.map((id) => best.get(id)?.value).find(Boolean) ?? '';
  const family = pick(NAME_TYPO_FAMILY, NAME_FAMILY);
  const style = pick(NAME_TYPO_STYLE, NAME_STYLE);
  const fullName = best.get(NAME_FULL)?.value ?? [family, style].filter(Boolean).join(' ');
  return { family, style, fullName };
}

function scoreRecord(platform: number, encoding: number, language: number): number {
  if (platform === 3) {
    // 1 is UCS-2 and 10 is UCS-4; 0 is the symbol encoding, still UTF-16 text.
    if (encoding === 1 || encoding === 10) return language === 0x409 ? 100 : 80;
    return 40;
  }
  if (platform === 0) return 60;
  if (platform === 1 && encoding === 0) return 20;
  return 0;
}

const UTF16BE = new TextDecoder('utf-16be');

function decodeName(bytes: Uint8Array, platform: number): string {
  // Macintosh records are MacRoman. Nothing in the platform decodes that, and
  // its lower half is ASCII, which is all a font name is in practice. Anything
  // above 0x7F comes out as the Latin-1 character instead of the right one,
  // which is a wrong accent in a rare fallback rather than a failure.
  if (platform === 1) return String.fromCharCode(...bytes);
  return UTF16BE.decode(bytes);
}

function u16(b: Uint8Array, at: number): number {
  return ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
}

function u32(b: Uint8Array, at: number): number {
  return (u16(b, at) * 0x10000 + u16(b, at + 2)) >>> 0;
}

function tagAt(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at] ?? 0, b[at + 1] ?? 0, b[at + 2] ?? 0, b[at + 3] ?? 0);
}
