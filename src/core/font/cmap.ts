/**
 * What a font can actually draw, out of its `cmap` table.
 *
 * The tempting shortcut is to measure: draw the character on a canvas in the
 * font, draw it again in a fallback, and call it covered if the two differ.
 * That is wrong often enough to be useless. Two fonts can draw the same glyph
 * identically; a missing glyph does not always come out as the .notdef box,
 * because the browser silently substitutes another font; and on a page with
 * font-family fallbacks you are measuring the fallback, not the font you asked
 * about. The answer is not a guess, it is a lookup table inside the file, so we
 * read the lookup table.
 *
 * The subtlety worth knowing about is .notdef. A cmap segment can span a range
 * of code points and still map some of them to glyph 0, which is the empty box.
 * A reader that trusts the segment bounds reports coverage the font does not
 * have. Every format below is therefore evaluated down to the glyph id.
 */

export interface Coverage {
  has(codepoint: number): boolean;
  /** How many code points map to a real glyph. */
  readonly count: number;
  /**
   * The font maps only through the symbol encoding (Wingdings and friends).
   * Its "A" is a picture, not the letter, so the UI should say so.
   */
  readonly symbolic: boolean;
}

interface Range {
  start: number;
  end: number;
}

export const EMPTY_COVERAGE: Coverage = buildCoverage([], false);

/**
 * Encoding records worth reading, best first. The full-repertoire subtables
 * come before the BMP-only ones: where a font has both, the wider is a superset
 * and the only one that can answer a question about an emoji.
 */
const PREFERENCE: [platform: number, encoding: number][] = [
  [3, 10], // Windows, UCS-4
  [0, 6], // Unicode, full repertoire
  [0, 4],
  [3, 1], // Windows, BMP
  [0, 3], // Unicode, BMP
  [0, 2],
  [0, 1],
  [0, 0],
  [3, 0], // Windows symbol encoding
  [1, 0], // Macintosh Roman
];

export function parseCmap(table: Uint8Array): Coverage {
  if (table.length < 4) return EMPTY_COVERAGE;
  const numTables = u16(table, 2);

  const records: { rank: number; platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = 4 + i * 8;
    if (at + 8 > table.length) break;
    const platform = u16(table, at);
    const encoding = u16(table, at + 2);
    const rank = PREFERENCE.findIndex(([p, e]) => p === platform && e === encoding);
    if (rank < 0) continue;
    records.push({ rank, platform, encoding, offset: u32(table, at + 4) });
  }
  records.sort((a, b) => a.rank - b.rank);

  for (const record of records) {
    const ranges = parseSubtable(table, record.offset);
    // A subtable we cannot read, or one that maps nothing, is no answer at all:
    // fall through to the next-best encoding rather than reporting a font as
    // having no glyphs.
    if (!ranges || ranges.length === 0) continue;
    return buildCoverage(ranges, record.platform === 3 && record.encoding === 0);
  }
  return EMPTY_COVERAGE;
}

/** Guards a malformed table from spinning the main thread. No real cmap is near this. */
const MAX_STEPS = 0x20000;

function parseSubtable(t: Uint8Array, offset: number): Range[] | null {
  if (offset + 4 > t.length) return null;
  switch (u16(t, offset)) {
    case 0:
      return parseFormat0(t, offset);
    case 4:
      return parseFormat4(t, offset);
    case 6:
      return parseFormat6(t, offset);
    case 12:
      return parseFormat12(t, offset);
    default:
      return null;
  }
}

function parseFormat0(t: Uint8Array, o: number): Range[] | null {
  if (o + 262 > t.length) return null;
  const ranges: Range[] = [];
  for (let c = 0; c < 256; c++) {
    if (t[o + 6 + c]) ranges.push({ start: c, end: c });
  }
  return ranges;
}

function parseFormat4(t: Uint8Array, o: number): Range[] | null {
  const segCount = u16(t, o + 6) >> 1;
  if (segCount === 0) return null;

  const endBase = o + 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const rangeOffsetBase = deltaBase + segCount * 2;
  if (rangeOffsetBase + segCount * 2 > t.length) return null;

  const ranges: Range[] = [];
  let steps = 0;
  for (let i = 0; i < segCount; i++) {
    const end = u16(t, endBase + i * 2);
    const start = u16(t, startBase + i * 2);
    const delta = u16(t, deltaBase + i * 2);
    const rangeOffset = u16(t, rangeOffsetBase + i * 2);
    if (start > end) continue;

    for (let c = start; c <= end; c++) {
      if (++steps > MAX_STEPS) return ranges;
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff;
      } else {
        // idRangeOffset is a byte distance from its own slot in the array, an
        // addressing trick from a time when the table was mapped, not parsed.
        const at = rangeOffsetBase + i * 2 + rangeOffset + (c - start) * 2;
        if (at + 2 > t.length) continue;
        const indexed = u16(t, at);
        glyph = indexed === 0 ? 0 : (indexed + delta) & 0xffff;
      }
      if (glyph !== 0) ranges.push({ start: c, end: c });
    }
  }
  return ranges;
}

function parseFormat6(t: Uint8Array, o: number): Range[] | null {
  if (o + 10 > t.length) return null;
  const first = u16(t, o + 6);
  const count = u16(t, o + 8);
  if (o + 10 + count * 2 > t.length) return null;

  const ranges: Range[] = [];
  for (let i = 0; i < count; i++) {
    if (u16(t, o + 10 + i * 2) !== 0) ranges.push({ start: first + i, end: first + i });
  }
  return ranges;
}

function parseFormat12(t: Uint8Array, o: number): Range[] | null {
  if (o + 16 > t.length) return null;
  const groups = u32(t, o + 12);
  if (o + 16 + groups * 12 > t.length) return null;

  const ranges: Range[] = [];
  for (let i = 0; i < groups; i++) {
    const at = o + 16 + i * 12;
    const start = u32(t, at);
    const end = u32(t, at + 4);
    const startGlyph = u32(t, at + 8);
    if (end < start) continue;
    // Glyph ids run consecutively across the group, so only the first entry can
    // be .notdef.
    const from = startGlyph === 0 ? start + 1 : start;
    if (from <= end) ranges.push({ start: from, end });
  }
  return ranges;
}

/** Private-use block that the Windows symbol encoding maps the low bytes into. */
const SYMBOL_BASE = 0xf000;

function buildCoverage(ranges: Range[], symbolic: boolean): Coverage {
  const merged = merge(ranges);
  const starts = new Int32Array(merged.length);
  const ends = new Int32Array(merged.length);
  let count = 0;
  merged.forEach((r, i) => {
    starts[i] = r.start;
    ends[i] = r.end;
    count += r.end - r.start + 1;
  });

  const inRanges = (cp: number): boolean => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cp < starts[mid]!) hi = mid - 1;
      else if (cp > ends[mid]!) lo = mid + 1;
      else return true;
    }
    return false;
  };

  return {
    count,
    symbolic,
    has(cp) {
      if (inRanges(cp)) return true;
      return symbolic && cp < 0x100 && inRanges(SYMBOL_BASE + cp);
    },
  };
}

function merge(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [{ ...sorted[0]! }];
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1]!;
    if (r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

function u16(b: Uint8Array, at: number): number {
  return ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
}

function u32(b: Uint8Array, at: number): number {
  return (u16(b, at) * 0x10000 + u16(b, at + 2)) >>> 0;
}
