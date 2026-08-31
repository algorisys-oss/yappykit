import { describe, it, expect } from 'vitest';
import { readFonts, matchFonts, type FontEntry } from './index';
import { bytesSource } from './sfnt';
import { requiredCharacters } from './text';
import { cmap4, cmapTable, collection, nameTable, sfnt } from './fixtures';

function font(name: string, style: string, segments: { start: number; end: number }[]): Uint8Array {
  return sfnt({
    name: nameTable([
      { nameId: 1, value: name },
      { nameId: 2, value: style },
    ]),
    cmap: cmapTable([
      { platform: 3, encoding: 1, data: cmap4(segments.map((s) => ({ ...s, delta: 0 }))) },
    ]),
  });
}

const LATIN = [{ start: 0x20, end: 0x7e }];
const read = (bytes: Uint8Array, fileName = 'test.ttf') =>
  readFonts(bytesSource(bytes), { origin: 'file', fileName });

describe('readFonts', () => {
  it('reads a font into its names and its coverage', async () => {
    const [entry] = await read(font('Fixture Sans', 'Regular', LATIN));
    expect(entry).toMatchObject({
      family: 'Fixture Sans',
      style: 'Regular',
      fullName: 'Fixture Sans Regular',
      origin: 'file',
      fileName: 'test.ttf',
      symbolic: false,
    });
    expect(entry!.coverage.has(0x41)).toBe(true);
    expect(entry!.glyphCount).toBe(0x7e - 0x20 + 1);
  });

  it('returns one entry per member of a collection', async () => {
    const bytes = collection([font('One', 'Regular', LATIN), font('Two', 'Regular', LATIN)]);
    const entries = await read(bytes, 'pair.ttc');
    expect(entries.map((e) => e.family)).toEqual(['One', 'Two']);
  });

  /**
   * queryLocalFonts() reports every face separately, but a face inside a .ttc
   * hands back the WHOLE collection as its blob. Parsing all of it per face
   * would list every member once for each member it has.
   */
  it('takes only the named member when the caller knows which face it asked for', async () => {
    const bytes = collection([font('One', 'Regular', LATIN), font('Two', 'Bold', LATIN)]);
    const entries = await readFonts(bytesSource(bytes), { origin: 'installed', preferName: 'Two Bold' });
    expect(entries.map((e) => e.fullName)).toEqual(['Two Bold']);
  });

  it('falls back to the first member when the named face is not in the file', async () => {
    const bytes = collection([font('One', 'Regular', LATIN)]);
    const entries = await readFonts(bytesSource(bytes), { origin: 'installed', preferName: 'Absent' });
    expect(entries.map((e) => e.family)).toEqual(['One']);
  });

  it('names a font with no name table after the file it came from', async () => {
    const bytes = sfnt({
      cmap: cmapTable([{ platform: 3, encoding: 1, data: cmap4([{ start: 0x41, end: 0x5a, delta: 0 }]) }]),
    });
    const [entry] = await read(bytes, 'Mystery-Bold.otf');
    expect(entry!.family).toBe('Mystery-Bold');
    expect(entry!.fullName).toBe('Mystery-Bold');
  });

  it('reports a font with no cmap as covering nothing, rather than failing', async () => {
    const [entry] = await read(sfnt({ name: nameTable([{ nameId: 1, value: 'Empty' }]) }));
    expect(entry!.glyphCount).toBe(0);
    expect(entry!.coverage.has(0x41)).toBe(false);
  });

  it('gives every entry a distinct id, including within one collection', async () => {
    const bytes = collection([font('Same', 'Regular', LATIN), font('Same', 'Regular', LATIN)]);
    const entries = await read(bytes, 'twins.ttc');
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });
});

describe('matchFonts', () => {
  const entry = (family: string, segments: { start: number; end: number }[]): FontEntry => ({
    id: family,
    family,
    style: 'Regular',
    fullName: family,
    origin: 'file',
    coverage: {
      has: (cp) => segments.some((s) => cp >= s.start && cp <= s.end),
      count: 1,
      symbolic: false,
    },
    glyphCount: 1,
    symbolic: false,
  });

  const latin = entry('Latin Only', [{ start: 0x20, end: 0x7e }]);
  const rupee = entry('Latin Plus Rupee', [
    { start: 0x20, end: 0x7e },
    { start: 0x20b9, end: 0x20b9 },
  ]);
  const devanagari = entry('Devanagari', [
    { start: 0x20, end: 0x7e },
    { start: 0x900, end: 0x97f },
    { start: 0x20b9, end: 0x20b9 },
  ]);

  it('separates the fonts that can render the text from the ones that cannot', () => {
    const required = requiredCharacters('₹99');
    const report = matchFonts([latin, rupee], required);
    expect(report.complete.map((m) => m.font.family)).toEqual(['Latin Plus Rupee']);
    expect(report.partial.map((m) => m.font.family)).toEqual(['Latin Only']);
    expect(report.partial[0]!.missing).toEqual([0x20b9]);
  });

  it('puts the near misses first, because those are the ones worth a look', () => {
    const report = matchFonts([latin, rupee], requiredCharacters('नमस्ते ₹99'));
    expect(report.complete).toEqual([]);
    expect(report.partial.map((m) => m.font.family)).toEqual(['Latin Plus Rupee', 'Latin Only']);
    expect(report.partial[0]!.missing.length).toBeLessThan(report.partial[1]!.missing.length);
  });

  it('lists the complete matches alphabetically, which is how a font menu reads', () => {
    const report = matchFonts([rupee, devanagari, latin], requiredCharacters('abc'));
    expect(report.complete.map((m) => m.font.family)).toEqual([
      'Devanagari',
      'Latin Only',
      'Latin Plus Rupee',
    ]);
  });

  it('reports the missing characters in the order they appear in the text', () => {
    const report = matchFonts([latin], requiredCharacters('नम ₹'));
    expect(report.partial[0]!.missing).toEqual([0x928, 0x92e, 0x20b9]);
  });

  it('counts every font as a match when there is nothing to render', () => {
    const report = matchFonts([latin, rupee], []);
    expect(report.complete).toHaveLength(2);
    expect(report.partial).toEqual([]);
  });
});
