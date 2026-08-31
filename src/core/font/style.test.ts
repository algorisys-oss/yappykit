import { describe, it, expect } from 'vitest';
import { categoryOf, contrastOf, scoreFeel, rankByFeel, FEELS } from './style';
import type { FontMetrics } from './metrics';
import type { FontEntry } from './index';

const NOTHING: FontMetrics = {
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

const metrics = (over: Partial<FontMetrics>): FontMetrics => ({ ...NOTHING, ...over });

const panose = (over: Partial<NonNullable<FontMetrics['panose']>>) => ({
  familyType: null,
  serifStyle: null,
  weight: null,
  proportion: null,
  contrast: null,
  strokeVariation: null,
  armStyle: null,
  letterform: null,
  midline: null,
  xHeight: null,
  ...over,
});

describe('categoryOf', () => {
  it('reads the IBM family class', () => {
    expect(categoryOf(metrics({ familyClass: 1 }))).toBe('serif');
    expect(categoryOf(metrics({ familyClass: 3 }))).toBe('serif');
    expect(categoryOf(metrics({ familyClass: 5 }))).toBe('slab');
    expect(categoryOf(metrics({ familyClass: 8 }))).toBe('sans');
    expect(categoryOf(metrics({ familyClass: 10 }))).toBe('script');
    expect(categoryOf(metrics({ familyClass: 12 }))).toBe('display');
  });

  it('lets fixed pitch win, because a monospace serif is still monospace here', () => {
    expect(categoryOf(metrics({ familyClass: 1, fixedPitch: true }))).toBe('mono');
  });

  it('falls back to PANOSE when the family class says nothing', () => {
    expect(categoryOf(metrics({ panose: panose({ familyType: 2, serifStyle: 11 }) }))).toBe('sans');
    expect(categoryOf(metrics({ panose: panose({ familyType: 2, serifStyle: 2 }) }))).toBe('serif');
    expect(categoryOf(metrics({ panose: panose({ familyType: 3 }) }))).toBe('script');
    expect(categoryOf(metrics({ panose: panose({ proportion: 9 }) }))).toBe('mono');
  });

  it('says unknown rather than guessing', () => {
    expect(categoryOf(NOTHING)).toBe('unknown');
  });
});

describe('contrastOf', () => {
  it('reads PANOSE where the font filled it in', () => {
    expect(contrastOf(metrics({ panose: panose({ contrast: 2 }) }))).toBe('low');
    expect(contrastOf(metrics({ panose: panose({ contrast: 6 }) }))).toBe('medium');
    expect(contrastOf(metrics({ panose: panose({ contrast: 9 }) }))).toBe('high');
  });

  it('infers only from the family classes that are definitional', () => {
    // A Didone is high contrast by definition; a slab is low by definition.
    expect(contrastOf(metrics({ familyClass: 3 }))).toBe('high');
    expect(contrastOf(metrics({ familyClass: 5 }))).toBe('low');
    // A sans is usually low contrast, but "usually" is not a measurement.
    expect(contrastOf(metrics({ familyClass: 8 }))).toBe('unknown');
  });
});

describe('scoreFeel', () => {
  it('scores a Didone as elegant on every trait', () => {
    const didone = metrics({
      familyClass: 3,
      weightClass: 400,
      xHeightRatio: 0.66,
      panose: panose({ contrast: 8 }),
    });
    const score = scoreFeel(didone, 'elegant');
    expect(score.missed).toEqual([]);
    expect(score.score).toBe(1);
    expect(score.applicable).toBe(4);
  });

  it('names the traits a font misses', () => {
    const heavySans = metrics({ familyClass: 8, weightClass: 900, xHeightRatio: 0.78 });
    const score = scoreFeel(heavySans, 'elegant');
    expect(score.missed).toContain('category');
    expect(score.missed).toContain('weight');
    expect(score.missed).toContain('xheight');
    expect(score.score).toBeLessThan(1);
  });

  /**
   * The rule that keeps the whole thing honest. A font that predates OS/2
   * version 2 has no x-height to test, and counting that as a failure would
   * punish it for its age rather than for how it looks.
   */
  it('leaves an untestable trait out of the denominator instead of failing it', () => {
    const weightOnly = metrics({ weightClass: 400 });
    const score = scoreFeel(weightOnly, 'elegant');
    expect(score.unknown).toEqual(expect.arrayContaining(['category', 'xheight', 'contrast']));
    expect(score.applicable).toBe(1);
    expect(score.score).toBe(1);
  });

  it('has no opinion at all about a font with no metrics', () => {
    const score = scoreFeel(NOTHING, 'elegant');
    expect(score.applicable).toBe(0);
    expect(score.score).toBeNull();
  });

  it('defines every feel over at least three traits', () => {
    for (const feel of Object.keys(FEELS) as (keyof typeof FEELS)[]) {
      expect(FEELS[feel].length, `${feel} is too thin to be meaningful`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('rankByFeel', () => {
  const entry = (id: string, m: Partial<FontMetrics>): FontEntry =>
    ({
      id,
      family: id,
      style: 'Regular',
      fullName: id,
      origin: 'file',
      coverage: { has: () => true, count: 1, symbolic: false },
      glyphCount: 1,
      symbolic: false,
      metrics: metrics(m),
    }) as FontEntry;

  const didone = entry('Didone', {
    familyClass: 3,
    weightClass: 400,
    xHeightRatio: 0.66,
    panose: panose({ contrast: 8 }),
  });
  const grotesque = entry('Grotesque', { familyClass: 8, weightClass: 400, xHeightRatio: 0.76 });
  const black = entry('Black', { familyClass: 8, weightClass: 900, xHeightRatio: 0.78, widthClass: 6 });

  it('puts a full match in strong and a partial one below it', () => {
    const report = rankByFeel([grotesque, didone, black], 'elegant');
    expect(report.strong.map((m) => m.font.family)).toEqual(['Didone']);
    expect(report.strong[0]!.score.score).toBe(1);
    expect(report.weak).toBeGreaterThan(0);
  });

  /**
   * A font that matched one trait out of one is not a better answer than one
   * that matched four out of four, however the arithmetic reads.
   */
  it('keeps a font off the strong list when the evidence is one trait', () => {
    const thin = entry('Thin Evidence', { weightClass: 400 });
    const report = rankByFeel([thin], 'elegant');
    expect(report.strong).toEqual([]);
    expect(report.partial.map((m) => m.font.family)).toEqual(['Thin Evidence']);
  });

  it('sets aside the fonts it cannot classify rather than scoring them zero', () => {
    const blank = entry('Blank', {});
    const report = rankByFeel([blank, didone], 'elegant');
    expect(report.unclassified.map((m) => m.font.family)).toEqual(['Blank']);
    expect(report.strong.map((m) => m.font.family)).toEqual(['Didone']);
  });

  it('ranks a heavy wide sans as loud', () => {
    const report = rankByFeel([didone, black], 'loud');
    expect(report.strong.map((m) => m.font.family)).toEqual(['Black']);
  });

  it('leaves a font with no metrics at all out of every bucket but unclassified', () => {
    const noMetrics = { ...grotesque, metrics: undefined } as FontEntry;
    const report = rankByFeel([noMetrics], 'friendly');
    expect(report.unclassified).toHaveLength(1);
  });
});
