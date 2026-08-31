/**
 * Synthetic font binaries for the unit tests.
 *
 * TEST-ONLY. Nothing in src/routes or src/core imports this, so it never
 * reaches a bundle. It is not named *.test.ts because vitest would collect it
 * as a suite (see `test.include` in vite.config.ts).
 *
 * Real fonts are unusable as fixtures here: a licensed binary cannot be checked
 * in, and one that could would still be a black box — you cannot assert that a
 * cmap segment with a hole in it is read correctly unless you are the one who
 * put the hole there. Everything below is built byte by byte from the OpenType
 * spec so each test states exactly the shape it is exercising.
 */

class Writer {
  private out: number[] = [];

  get length(): number {
    return this.out.length;
  }

  u8(v: number): this {
    this.out.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }

  u32(v: number): this {
    return this.u16(v >>> 16).u16(v & 0xffff);
  }

  tag(s: string): this {
    for (const ch of s) this.u8(ch.charCodeAt(0));
    return this;
  }

  raw(bytes: Uint8Array): this {
    for (const b of bytes) this.out.push(b);
    return this;
  }

  /** Overwrite four bytes already written, for a length known only afterwards. */
  patchU32(at: number, v: number): this {
    this.out[at] = (v >>> 24) & 0xff;
    this.out[at + 1] = (v >>> 16) & 0xff;
    this.out[at + 2] = (v >>> 8) & 0xff;
    this.out[at + 3] = v & 0xff;
    return this;
  }

  done(): Uint8Array {
    return new Uint8Array(this.out);
  }
}

export interface Segment {
  start: number;
  end: number;
  /** Added to the code point (mod 65536) to get the glyph id. 0 means .notdef. */
  delta: number;
}

/** A cmap format 4 subtable — the BMP mapping every text font carries. */
export function cmap4(segments: Segment[]): Uint8Array {
  // The terminating 0xFFFF segment is mandatory and maps to .notdef.
  const segs = [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
  const w = new Writer();
  w.u16(4).u16(0).u16(0); // format, length (patched), language
  const segCount = segs.length;
  w.u16(segCount * 2).u16(0).u16(0).u16(0); // segCountX2 + the unused binary-search fields
  for (const s of segs) w.u16(s.end);
  w.u16(0); // reservedPad
  for (const s of segs) w.u16(s.start);
  for (const s of segs) w.u16(s.delta);
  for (const _ of segs) w.u16(0); // idRangeOffset: every segment maps by delta

  const bytes = w.done();
  bytes[2] = (bytes.length >> 8) & 0xff;
  bytes[3] = bytes.length & 0xff;
  return bytes;
}

/**
 * A cmap format 4 subtable whose glyph ids come from glyphIdArray rather than a
 * delta. This is the path that carries holes: a zero entry inside a segment is
 * a code point the font does not actually have.
 */
export function cmap4Indexed(start: number, glyphIds: number[]): Uint8Array {
  const end = start + glyphIds.length - 1;
  const w = new Writer();
  w.u16(4).u16(0).u16(0);
  w.u16(4).u16(0).u16(0).u16(0); // two segments: ours, then the 0xFFFF terminator
  w.u16(end).u16(0xffff);
  w.u16(0);
  w.u16(start).u16(0xffff);
  w.u16(0).u16(1);
  // idRangeOffset counts bytes forward from its OWN slot in the array.
  w.u16(4).u16(0);
  for (const g of glyphIds) w.u16(g);

  const bytes = w.done();
  bytes[2] = (bytes.length >> 8) & 0xff;
  bytes[3] = bytes.length & 0xff;
  return bytes;
}

export interface Group {
  start: number;
  end: number;
  startGlyph: number;
}

/** A cmap format 12 subtable — the one that reaches past the BMP. */
export function cmap12(groups: Group[]): Uint8Array {
  const w = new Writer();
  w.u16(12).u16(0);
  const lengthAt = w.length;
  w.u32(0).u32(0).u32(groups.length); // length (patched), language, nGroups
  for (const g of groups) w.u32(g.start).u32(g.end).u32(g.startGlyph);
  w.patchU32(lengthAt, w.length);
  return w.done();
}

/** A cmap format 6 subtable: one contiguous run of glyph ids. */
export function cmap6(first: number, glyphIds: number[]): Uint8Array {
  const w = new Writer();
  w.u16(6).u16(6 + 4 + glyphIds.length * 2).u16(0);
  w.u16(first).u16(glyphIds.length);
  for (const g of glyphIds) w.u16(g);
  return w.done();
}

/** A cmap format 0 subtable: the 256-byte byte-encoding table. */
export function cmap0(glyphIds: number[]): Uint8Array {
  const w = new Writer();
  w.u16(0).u16(262).u16(0);
  for (let i = 0; i < 256; i++) w.u8(glyphIds[i] ?? 0);
  return w.done();
}

export interface Subtable {
  platform: number;
  encoding: number;
  data: Uint8Array;
}

/** Wrap subtables in a cmap table, with one encoding record each. */
export function cmapTable(subtables: Subtable[]): Uint8Array {
  const w = new Writer();
  w.u16(0).u16(subtables.length);
  let offset = 4 + subtables.length * 8;
  for (const s of subtables) {
    w.u16(s.platform).u16(s.encoding).u32(offset);
    offset += s.data.length;
  }
  for (const s of subtables) w.raw(s.data);
  return w.done();
}

export interface NameRecord {
  nameId: number;
  value: string;
  platform?: number;
  encoding?: number;
  language?: number;
}

/** A name table. Windows records are UTF-16BE; Macintosh records are bytes. */
export function nameTable(records: NameRecord[]): Uint8Array {
  const encoded = records.map((r) => {
    const platform = r.platform ?? 3;
    const bytes =
      platform === 1
        ? new Uint8Array([...r.value].map((c) => c.charCodeAt(0)))
        : new Uint8Array(
            [...r.value].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff]),
          );
    return { ...r, platform, bytes };
  });

  const w = new Writer();
  const stringOffset = 6 + encoded.length * 12;
  w.u16(0).u16(encoded.length).u16(stringOffset);
  let at = 0;
  for (const r of encoded) {
    w.u16(r.platform)
      .u16(r.encoding ?? (r.platform === 1 ? 0 : 1))
      .u16(r.language ?? (r.platform === 1 ? 0 : 0x409))
      .u16(r.nameId)
      .u16(r.bytes.length)
      .u16(at);
    at += r.bytes.length;
  }
  for (const r of encoded) w.raw(r.bytes);
  return w.done();
}

export type Tables = Record<string, Uint8Array>;

/** An sfnt (TrueType/OpenType) font wrapping the given tables. */
export function sfnt(tables: Tables, flavor = 0x00010000): Uint8Array {
  const tags = Object.keys(tables).sort();
  const w = new Writer();
  w.u32(flavor).u16(tags.length).u16(0).u16(0).u16(0);

  let offset = 12 + tags.length * 16;
  const starts: number[] = [];
  for (const tag of tags) {
    starts.push(offset);
    // Tables are 4-byte aligned in a real font, and a reader that ignores the
    // padding reads the next table's first bytes as this one's last.
    offset += align4(tables[tag]!.length);
  }

  tags.forEach((tag, i) => {
    w.tag(tag).u32(0).u32(starts[i]!).u32(tables[tag]!.length);
  });
  for (const tag of tags) {
    w.raw(tables[tag]!);
    for (let i = tables[tag]!.length; i < align4(tables[tag]!.length); i++) w.u8(0);
  }
  return w.done();
}

function align4(n: number): number {
  return (n + 3) & ~3;
}

/**
 * A TrueType Collection holding several complete fonts in one file.
 *
 * A member's table directory holds offsets from the start of the FILE, not from
 * the start of the member: that is what lets two members share one table by
 * pointing at the same bytes. So each embedded font's directory is rewritten as
 * it is placed.
 */
export function collection(fonts: Uint8Array[]): Uint8Array {
  const header = 12 + fonts.length * 4;
  const w = new Writer();
  w.tag('ttcf').u32(0x00010000).u32(fonts.length);

  let offset = header;
  const bases: number[] = [];
  for (const f of fonts) {
    bases.push(offset);
    w.u32(offset);
    offset += align4(f.length);
  }

  fonts.forEach((f, i) => {
    const rebased = rebase(f, bases[i]!);
    w.raw(rebased);
    for (let n = rebased.length; n < align4(rebased.length); n++) w.u8(0);
  });
  return w.done();
}

/** Shift every table offset in a font's directory by `base`. */
function rebase(font: Uint8Array, base: number): Uint8Array {
  const out = font.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const at = 12 + i * 16 + 8;
    view.setUint32(at, view.getUint32(at) + base);
  }
  return out;
}

/**
 * A WOFF wrapping the given tables, each table zlib-compressed on its own.
 * Async because the compression uses CompressionStream, which is the same
 * primitive the reader inverts.
 */
export async function woff(tables: Tables, flavor = 0x00010000): Promise<Uint8Array> {
  const tags = Object.keys(tables).sort();
  const compressed = await Promise.all(tags.map((t) => deflate(tables[t]!)));

  const w = new Writer();
  const directory = 44 + tags.length * 20;
  w.tag('wOFF').u32(flavor).u32(0).u16(tags.length).u16(0);
  w.u32(0).u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);

  let offset = directory;
  const starts: number[] = [];
  for (const c of compressed) {
    starts.push(offset);
    offset += align4(c.length);
  }

  tags.forEach((tag, i) => {
    w.tag(tag).u32(starts[i]!).u32(compressed[i]!.length).u32(tables[tag]!.length).u32(0);
  });
  for (const c of compressed) {
    w.raw(c);
    for (let i = c.length; i < align4(c.length); i++) w.u8(0);
  }

  const bytes = w.done();
  const patched = new Writer().raw(bytes).done();
  const view = new DataView(patched.buffer);
  view.setUint32(8, patched.length);
  return patched;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  void writer.write(bytes as BufferSource);
  void writer.close();
  return drain(cs.readable);
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** A WOFF2, which we only ever need to recognise and refuse. */
export function woff2Stub(): Uint8Array {
  return new Writer().tag('wOF2').u32(0x00010000).u32(48).u16(1).u16(0).done();
}
