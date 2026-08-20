import { describe, it, expect } from 'vitest';
import {
  CARD_WIDTH_MM, MM_PER_INCH, DEFAULT_PPI,
  ppiFromCardWidth, cardWidthForPpi, mmToPx, pxToMm, inchToPx, pxToInch,
  isPlausiblePpi, ticks, readout, loadPpi, savePpi, clearPpi,
} from './calibrate';

describe('card-based calibration', () => {
  it('derives the CSS default when the card is drawn at CSS-nominal width', () => {
    // 85.6 mm at the CSS-assumed 96 ppi.
    const width = (CARD_WIDTH_MM / MM_PER_INCH) * DEFAULT_PPI;
    expect(ppiFromCardWidth(width)).toBeCloseTo(DEFAULT_PPI, 6);
  });

  it('round-trips ppi through the card width', () => {
    for (const ppi of [96, 110.5, 157, 220, 401]) {
      expect(ppiFromCardWidth(cardWidthForPpi(ppi))).toBeCloseTo(ppi, 6);
    }
  });

  it('reports a higher density when the user drags the outline wider', () => {
    const base = cardWidthForPpi(96);
    expect(ppiFromCardWidth(base * 1.25)).toBeCloseTo(120, 6);
  });
});

describe('unit conversion', () => {
  it('converts mm and px symmetrically', () => {
    expect(pxToMm(mmToPx(37.5, 141), 141)).toBeCloseTo(37.5, 9);
  });

  it('converts inches and px symmetrically', () => {
    expect(pxToInch(inchToPx(3.25, 141), 141)).toBeCloseTo(3.25, 9);
  });

  it('puts exactly 25.4 mm in an inch', () => {
    const ppi = 137;
    expect(pxToMm(inchToPx(1, ppi), ppi)).toBeCloseTo(MM_PER_INCH, 9);
  });
});

describe('plausibility guard', () => {
  it('accepts real-world densities', () => {
    for (const p of [96, 120, 141, 163, 264, 401]) expect(isPlausiblePpi(p)).toBe(true);
  });

  it('rejects values no display could have, and non-numbers', () => {
    for (const p of [0, -96, 12, 5000, NaN, Infinity]) expect(isPlausiblePpi(p)).toBe(false);
  });
});

describe('ticks', () => {
  it('labels whole centimetres and puts nine minor ticks between them', () => {
    const ppi = 96;
    const t = ticks(mmToPx(50, ppi), ppi, 'cm');
    const labelled = t.filter((x) => x.label !== undefined);
    expect(labelled.map((x) => x.label)).toEqual(['0', '1', '2', '3', '4', '5']);
    // 51 ticks for 0..50 mm inclusive.
    expect(t).toHaveLength(51);
  });

  it('places the 1 cm tick exactly one centimetre along', () => {
    const ppi = 141;
    const t = ticks(mmToPx(30, ppi), ppi, 'cm');
    const oneCm = t.find((x) => x.label === '1')!;
    expect(pxToMm(oneCm.px, ppi)).toBeCloseTo(10, 9);
  });

  it('subdivides inches into sixteenths with graded weights', () => {
    const ppi = 96;
    const t = ticks(inchToPx(2, ppi), ppi, 'inch');
    expect(t.filter((x) => x.label !== undefined).map((x) => x.label)).toEqual(['0', '1', '2']);
    expect(t).toHaveLength(33);
    // Quarter-inch tick is taller than an eighth, which is taller than a sixteenth.
    expect(t[4]!.weight).toBeGreaterThan(t[2]!.weight);
    expect(t[2]!.weight).toBeGreaterThan(t[1]!.weight);
    // Half-inch taller still.
    expect(t[8]!.weight).toBeGreaterThan(t[4]!.weight);
  });

  it('returns nothing for a zero-length ruler or a nonsense density', () => {
    expect(ticks(0, 96, 'cm')).toEqual([]);
    expect(ticks(500, 0, 'cm')).toEqual([]);
    expect(ticks(500, NaN, 'inch')).toEqual([]);
  });
});

describe('readout', () => {
  it('reads centimetres to one decimal', () => {
    const ppi = 96;
    expect(readout(mmToPx(123, ppi), ppi, 'cm')).toBe('12.3');
  });

  it('reads inches to two decimals', () => {
    const ppi = 96;
    expect(readout(inchToPx(3.5, ppi), ppi, 'inch')).toBe('3.50');
  });
});

describe('persistence', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      map,
    };
  }

  it('round-trips a calibration', () => {
    const s = fakeStorage();
    savePpi(s, 141.2);
    expect(loadPpi(s)).toBeCloseTo(141.2, 6);
  });

  it('returns null when nothing is stored', () => {
    expect(loadPpi(fakeStorage())).toBeNull();
  });

  it('ignores corrupt or implausible stored values rather than measuring wrongly', () => {
    expect(loadPpi(fakeStorage({ 'yappykit-ruler-ppi': 'banana' }))).toBeNull();
    expect(loadPpi(fakeStorage({ 'yappykit-ruler-ppi': '0' }))).toBeNull();
    expect(loadPpi(fakeStorage({ 'yappykit-ruler-ppi': '99999' }))).toBeNull();
  });

  it('refuses to save an implausible calibration', () => {
    expect(() => savePpi(fakeStorage(), 5)).toThrow();
  });

  it('clears', () => {
    const s = fakeStorage();
    savePpi(s, 120);
    clearPpi(s);
    expect(loadPpi(s)).toBeNull();
  });
});
