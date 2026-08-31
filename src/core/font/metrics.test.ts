import { describe, it, expect } from 'vitest';
import { readMetrics } from './metrics';
import { bytesSource, openFonts } from './sfnt';
import { cmap4, cmapTable, head, hhea, os2, post, sfnt, type Tables } from './fixtures';

const CMAP = cmapTable([{ platform: 3, encoding: 1, data: cmap4([{ start: 65, end: 90, delta: 0 }]) }]);

async function metricsOf(tables: Tables) {
  const [resource] = await openFonts(bytesSource(sfnt({ cmap: CMAP, ...tables })));
  return readMetrics(resource!);
}

describe('readMetrics, OS/2', () => {
  it('reads the fields an operating system depends on', async () => {
    const m = await metricsOf({
      'OS/2': os2({ weightClass: 700, widthClass: 3, familyClass: (2 << 8) | 4 }),
    });
    expect(m).toMatchObject({ weightClass: 700, widthClass: 3, familyClass: 2, familySubclass: 4 });
  });

  it('computes the x-height ratio from version 2 and later', async () => {
    const m = await metricsOf({ 'OS/2': os2({ version: 4, xHeight: 500, capHeight: 700 }) });
    expect(m.xHeightRatio).toBeCloseTo(500 / 700, 5);
  });

  /**
   * sxHeight arrived in OS/2 version 2. On an older table those bytes are not
   * padding, they are off the end of the table, and reading them would produce
   * a confident number out of whatever follows.
   */
  it('has no x-height ratio on a version 0 or 1 table', async () => {
    for (const version of [0, 1]) {
      const m = await metricsOf({ 'OS/2': os2({ version, xHeight: 500, capHeight: 700 }) });
      expect(m.xHeightRatio, `version ${version}`).toBeNull();
      expect(m.weightClass, `version ${version} still has a weight`).toBe(400);
    }
  });

  it('refuses to divide by a cap height of zero', async () => {
    const m = await metricsOf({ 'OS/2': os2({ xHeight: 500, capHeight: 0 }) });
    expect(m.xHeightRatio).toBeNull();
  });

  it('rejects a weight or width outside the range the spec allows', async () => {
    const m = await metricsOf({ 'OS/2': os2({ weightClass: 0, widthClass: 42 }) });
    expect(m.weightClass).toBeNull();
    expect(m.widthClass).toBeNull();
  });

  it('reports nothing from OS/2 when the font has no OS/2', async () => {
    const m = await metricsOf({ post: post(0, true), head: head(2048) });
    expect(m.weightClass).toBeNull();
    expect(m.familyClass).toBeNull();
    expect(m.panose).toBeNull();
    // The other tables are still read: one missing table is not a missing font.
    expect(m.fixedPitch).toBe(true);
    expect(m.unitsPerEm).toBe(2048);
  });
});

describe('readMetrics, PANOSE', () => {
  /**
   * A large share of real fonts ship PANOSE as all zeros, which the spec defines
   * as "any" rather than "unknown". Read literally that says every font is
   * every style at once, so it has to be treated as absent.
   */
  it('treats an all-zero PANOSE as absent, because that is what it means', async () => {
    const m = await metricsOf({ 'OS/2': os2({ panose: new Array(10).fill(0) }) });
    expect(m.panose).toBeNull();
  });

  it('reads a filled-in PANOSE', async () => {
    // Latin text, cove serifs, medium weight, modern proportion, high contrast.
    const m = await metricsOf({ 'OS/2': os2({ panose: [2, 2, 6, 3, 8, 0, 0, 0, 0, 0] }) });
    expect(m.panose).toMatchObject({
      familyType: 2,
      serifStyle: 2,
      weight: 6,
      proportion: 3,
      contrast: 8,
    });
  });

  it('drops the individual fields that say "any" or "no fit"', async () => {
    const m = await metricsOf({ 'OS/2': os2({ panose: [2, 0, 1, 3, 0, 0, 0, 0, 0, 0] }) });
    expect(m.panose!.serifStyle).toBeNull();
    expect(m.panose!.weight).toBeNull();
    expect(m.panose!.proportion).toBe(3);
  });
});

describe('readMetrics, post and head', () => {
  it('reads a negative italic angle as the forward lean it is', async () => {
    const m = await metricsOf({ post: post(-12) });
    expect(m.italicAngle).toBeCloseTo(-12, 3);
  });

  it('reads an upright font as exactly zero', async () => {
    const m = await metricsOf({ post: post(0) });
    expect(m.italicAngle).toBe(0);
  });

  it('reads fixed pitch and units per em', async () => {
    const m = await metricsOf({ post: post(0, true), head: head(2048) });
    expect(m.fixedPitch).toBe(true);
    expect(m.unitsPerEm).toBe(2048);
  });

  it('reads the vertical space the font asks for, relative to its em', async () => {
    const m = await metricsOf({ head: head(1000), hhea: hhea(800, -200, 200) });
    expect(m.lineHeightRatio).toBeCloseTo(1.2, 5);
  });

  it('has no line height without a unitsPerEm to divide by', async () => {
    const m = await metricsOf({ hhea: hhea(800, -200, 0) });
    expect(m.lineHeightRatio).toBeNull();
  });
});

describe('readMetrics, a font with nothing to say', () => {
  it('returns all nulls rather than throwing', async () => {
    const m = await metricsOf({});
    expect(m).toEqual({
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
    });
  });
});
