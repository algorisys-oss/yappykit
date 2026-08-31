/**
 * What a font says about how it looks, out of OS/2, post, head and hhea.
 *
 * These four tables carry a description of the typeface's appearance that the
 * designer or the font tool wrote down: how heavy it is, how wide, whether it
 * has serifs and what kind, how tall its lowercase runs against its capitals.
 * That is most of what a person means when they say a font looks formal, or
 * looks technical, or looks loud.
 *
 * Every field here is nullable, and that is the design rather than defensive
 * habit. OS/2 can be absent entirely on an old Macintosh font; sxHeight arrived
 * in version 2, so on an older table those bytes are not padding but the next
 * table's; and PANOSE, which is the richest of the lot, is filled in carelessly
 * often enough that it can only ever corroborate. A caller that cannot tell
 * "this font is not condensed" from "nobody recorded whether it is condensed"
 * will confidently rank fonts on data that was never there, so the difference
 * is kept all the way through: absent reads as null, never as a default.
 */
import type { FontResource } from './sfnt';

/**
 * PANOSE, the ten-number classification of appearance.
 *
 * Each field is null where the font wrote 0 ("any") or 1 ("no fit"), both of
 * which mean the same thing to us: nothing was recorded.
 */
export interface Panose {
  familyType: number | null;
  serifStyle: number | null;
  weight: number | null;
  proportion: number | null;
  contrast: number | null;
  strokeVariation: number | null;
  armStyle: number | null;
  letterform: number | null;
  midline: number | null;
  xHeight: number | null;
}

export interface FontMetrics {
  /** 1 to 1000, where 400 is regular and 700 is bold. */
  weightClass: number | null;
  /** 1 (ultra condensed) to 9 (ultra expanded), 5 being normal. */
  widthClass: number | null;
  /** IBM family class: 1 to 3 serif, 4 to 5 slab, 8 sans, 10 script, 12 symbol. */
  familyClass: number | null;
  familySubclass: number | null;
  /** x-height over cap height. Unitless, so it compares across fonts directly. */
  xHeightRatio: number | null;
  /** Degrees. Negative leans forward, which is the normal direction. */
  italicAngle: number | null;
  fixedPitch: boolean | null;
  unitsPerEm: number | null;
  /** Default line height as a multiple of the em. */
  lineHeightRatio: number | null;
  panose: Panose | null;
}

const EMPTY: FontMetrics = {
  weightClass: null,
  widthClass: null,
  familyClass: null,
  familySubclass: null,
  xHeightRatio: null,
  italicAngle: null,
  fixedPitch: null,
  unitsPerEm: null,
  lineHeightRatio: null,
  panose: null,
};

export async function readMetrics(resource: FontResource): Promise<FontMetrics> {
  const [os2, post, head, hhea] = await Promise.all([
    resource.read('OS/2'),
    resource.read('post'),
    resource.read('head'),
    resource.read('hhea'),
  ]);

  const metrics: FontMetrics = { ...EMPTY };

  if (os2 && os2.length >= 78) {
    const version = u16(os2, 0);
    metrics.weightClass = inRange(u16(os2, 4), 1, 1000);
    metrics.widthClass = inRange(u16(os2, 6), 1, 9);

    const family = u16(os2, 30);
    // Class 0 is "no classification", which is absence written as a number.
    if (family >> 8 !== 0) {
      metrics.familyClass = family >> 8;
      metrics.familySubclass = family & 0xff;
    }

    metrics.panose = readPanose(os2.subarray(32, 42));

    // sxHeight and sCapHeight exist from version 2. Below that the offsets land
    // outside the table, and a length check is not enough on its own: a v0 table
    // followed immediately by another would read that table's first bytes as a
    // plausible x-height.
    if (version >= 2 && os2.length >= 90) {
      const xHeight = i16(os2, 86);
      const capHeight = i16(os2, 88);
      if (xHeight > 0 && capHeight > 0) metrics.xHeightRatio = xHeight / capHeight;
    }
  }

  if (post && post.length >= 16) {
    // italicAngle is 16.16 fixed point, and it is signed.
    metrics.italicAngle = i32(post, 4) / 65536;
    metrics.fixedPitch = u32(post, 12) !== 0;
  }

  if (head && head.length >= 20) {
    metrics.unitsPerEm = inRange(u16(head, 18), 16, 16384);
  }

  if (hhea && hhea.length >= 10 && metrics.unitsPerEm) {
    const span = i16(hhea, 4) - i16(hhea, 6) + i16(hhea, 8);
    if (span > 0) metrics.lineHeightRatio = span / metrics.unitsPerEm;
  }

  return metrics;
}

function readPanose(bytes: Uint8Array): Panose | null {
  if (bytes.length < 10) return null;
  // All zeros is "any" ten times over, which describes every font ever drawn.
  if (bytes.every((b) => b === 0)) return null;

  // 0 is "any" and 1 is "no fit". Neither tells us anything about the font.
  const digit = (i: number): number | null => {
    const value = bytes[i] ?? 0;
    return value <= 1 ? null : value;
  };

  return {
    familyType: digit(0),
    serifStyle: digit(1),
    weight: digit(2),
    proportion: digit(3),
    contrast: digit(4),
    strokeVariation: digit(5),
    armStyle: digit(6),
    letterform: digit(7),
    midline: digit(8),
    xHeight: digit(9),
  };
}

function inRange(value: number, lo: number, hi: number): number | null {
  return value >= lo && value <= hi ? value : null;
}

function u16(b: Uint8Array, at: number): number {
  return ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
}

function i16(b: Uint8Array, at: number): number {
  const value = u16(b, at);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function u32(b: Uint8Array, at: number): number {
  return (u16(b, at) * 0x10000 + u16(b, at + 2)) >>> 0;
}

function i32(b: Uint8Array, at: number): number {
  const value = u32(b, at);
  return value >= 0x80000000 ? value - 0x100000000 : value;
}
