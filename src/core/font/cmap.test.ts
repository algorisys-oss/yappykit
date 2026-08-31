import { describe, it, expect } from 'vitest';
import { parseCmap, EMPTY_COVERAGE } from './cmap';
import { cmap0, cmap4, cmap4Indexed, cmap6, cmap12, cmapTable } from './fixtures';

const cp = (s: string) => s.codePointAt(0)!;

describe('parseCmap, format 4', () => {
  it('covers the segment and nothing beyond it', () => {
    const c = parseCmap(cmapTable([{ platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x5a, delta: 0 }]) }]));
    expect(c.has(cp('A'))).toBe(true);
    expect(c.has(cp('Z'))).toBe(true);
    expect(c.has(cp('a'))).toBe(false);
    expect(c.count).toBe(26);
  });

  /**
   * A segment can exist and still map a code point to glyph 0. Reading the
   * segment bounds and stopping there reports coverage the font does not have,
   * which is the whole failure this tool exists to avoid.
   */
  it('does not count a code point that maps to .notdef', () => {
    // delta chosen so that (0x41 + delta) & 0xFFFF === 0.
    const c = parseCmap(
      cmapTable([{ platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x41, delta: 0x10000 - 0x41 }]) }]),
    );
    expect(c.has(cp('A'))).toBe(false);
    expect(c.count).toBe(0);
  });

  it('reads glyph ids out of glyphIdArray, holes included', () => {
    // Codes 0x41..0x44 with the third entry missing.
    const c = parseCmap(
      cmapTable([{ platform: 3, encoding: 1, data: cmap4Indexed(0x41, [10, 11, 0, 13]) }]),
    );
    expect([c.has(0x41), c.has(0x42), c.has(0x43), c.has(0x44)]).toEqual([true, true, false, true]);
    expect(c.count).toBe(3);
  });
});

describe('parseCmap, format 12', () => {
  it('reaches past the BMP, where the emoji live', () => {
    const emoji = cp('😀');
    const c = parseCmap(
      cmapTable([{ platform: 3, encoding: 10, data: cmap12([{ start: emoji, end: emoji + 4, startGlyph: 5 }]) }]),
    );
    expect(c.has(emoji)).toBe(true);
    expect(c.has(emoji + 4)).toBe(true);
    expect(c.has(emoji + 5)).toBe(false);
  });

  it('drops the first code point of a group that starts at .notdef', () => {
    const c = parseCmap(
      cmapTable([{ platform: 3, encoding: 10, data: cmap12([{ start: 0x41, end: 0x43, startGlyph: 0 }]) }]),
    );
    expect([c.has(0x41), c.has(0x42), c.has(0x43)]).toEqual([false, true, true]);
  });
});

describe('parseCmap, the older formats', () => {
  it('reads format 6', () => {
    const c = parseCmap(cmapTable([{ platform: 3, encoding: 1, data: cmap6(0x41, [7, 0, 9]) }]));
    expect([c.has(0x41), c.has(0x42), c.has(0x43)]).toEqual([true, false, true]);
  });

  it('reads format 0', () => {
    const glyphs = new Array(256).fill(0);
    glyphs[0x41] = 3;
    const c = parseCmap(cmapTable([{ platform: 1, encoding: 0, data: cmap0(glyphs) }]));
    expect(c.has(0x41)).toBe(true);
    expect(c.has(0x42)).toBe(false);
  });
});

describe('parseCmap, choosing a subtable', () => {
  it('prefers the full-Unicode subtable over the BMP one', () => {
    const emoji = cp('😀');
    const c = parseCmap(
      cmapTable([
        { platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x5a, delta: 0 }]) },
        { platform: 3, encoding: 10, data: cmap12([{ start: emoji, end: emoji, startGlyph: 5 }]) },
      ]),
    );
    expect(c.has(emoji)).toBe(true);
    expect(c.has(cp('A'))).toBe(false);
  });

  it('accepts the Unicode platform when there is no Windows subtable', () => {
    const c = parseCmap(cmapTable([{ platform: 0, encoding: 3, data: cmap4([{ start: 0x41, end: 0x41, delta: 0 }]) }]));
    expect(c.has(0x41)).toBe(true);
  });

  it('skips a subtable format it cannot read and uses the next one', () => {
    // Format 13 (many-to-one) is legal and rare; we do not parse it.
    const unreadable = new Uint8Array([0, 13, 0, 0, 0, 0, 0, 12, 0, 0, 0, 0]);
    const c = parseCmap(
      cmapTable([
        { platform: 3, encoding: 10, data: unreadable },
        { platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x41, delta: 0 }]) },
      ]),
    );
    expect(c.has(0x41)).toBe(true);
  });

  it('reports nothing rather than throwing when no subtable is usable', () => {
    expect(parseCmap(new Uint8Array(0)).count).toBe(0);
    expect(parseCmap(cmapTable([])).has(0x41)).toBe(false);
  });
});

describe('parseCmap, symbol fonts', () => {
  /**
   * Wingdings and its relatives carry only a (3,0) subtable and map the ASCII
   * range into the private-use block at U+F000. Typing "A" really does draw
   * their glyph, so reporting it as covered is right, but it is a picture and
   * not the letter, which is why the flag exists.
   */
  it('maps ASCII through the private-use block and says it did', () => {
    const c = parseCmap(
      cmapTable([{ platform: 3, encoding: 0, data: cmap4([{ start: 0xf000, end: 0xf0ff, delta: 0 }]) }]),
    );
    expect(c.symbolic).toBe(true);
    expect(c.has(cp('A'))).toBe(true);
    expect(c.has(cp('अ'))).toBe(false);
  });

  it('is not symbolic when a real Unicode subtable is present', () => {
    const c = parseCmap(
      cmapTable([
        { platform: 3, encoding: 0, data: cmap4([{ start: 0xf000, end: 0xf0ff, delta: 0 }]) },
        { platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x5a, delta: 0 }]) },
      ]),
    );
    expect(c.symbolic).toBe(false);
    expect(c.has(cp('A'))).toBe(true);
  });
});

describe('EMPTY_COVERAGE', () => {
  it('covers nothing', () => {
    expect(EMPTY_COVERAGE.has(0x41)).toBe(false);
    expect(EMPTY_COVERAGE.count).toBe(0);
  });
});
