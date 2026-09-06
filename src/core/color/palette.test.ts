import { describe, it, expect } from 'vitest';
import {
  toHex,
  toRgbCss,
  toHslCss,
  relativeLuminance,
  contrastRatio,
  readableTextOn,
  samplePixels,
  extractPalette,
  BLACK,
  WHITE,
  type Rgb,
} from './palette';

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

/** RGBA for a run of colours, each repeated `times`. */
function pixels(spec: readonly [Rgb, number][], alpha = 255): Uint8ClampedArray {
  const total = spec.reduce((n, [, times]) => n + times, 0);
  const out = new Uint8ClampedArray(total * 4);
  let at = 0;
  for (const [c, times] of spec) {
    for (let i = 0; i < times; i += 1) {
      out[at] = c.r;
      out[at + 1] = c.g;
      out[at + 2] = c.b;
      out[at + 3] = alpha;
      at += 4;
    }
  }
  return out;
}

describe('writing a colour down', () => {
  it('pads hex so it is six digits', () => {
    expect(toHex(rgb(0, 0, 0))).toBe('#000000');
    expect(toHex(rgb(1, 2, 3))).toBe('#010203');
    expect(toHex(rgb(255, 255, 255))).toBe('#ffffff');
  });

  it('rounds rather than truncating, and stays in range', () => {
    expect(toHex(rgb(127.6, -5, 300))).toBe('#8000ff');
    expect(toRgbCss(rgb(127.6, -5, 300))).toBe('rgb(128, 0, 255)');
  });

  it('writes hsl the way CSS does', () => {
    expect(toHslCss(rgb(255, 0, 0))).toBe('hsl(0, 100%, 50%)');
    expect(toHslCss(rgb(0, 255, 0))).toBe('hsl(120, 100%, 50%)');
    expect(toHslCss(rgb(0, 0, 255))).toBe('hsl(240, 100%, 50%)');
    // grey has no hue to report, and must not divide by zero finding that out
    expect(toHslCss(rgb(128, 128, 128))).toBe('hsl(0, 0%, 50%)');
  });
});

describe('contrast', () => {
  it('matches the WCAG extremes', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 2);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it('does not care which colour is named first', () => {
    const a = rgb(30, 90, 200);
    const b = rgb(240, 200, 10);
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('knows a mid grey against white is not enough for body text', () => {
    // #767676 is the classic boundary: 4.54:1, just over the 4.5 threshold.
    expect(contrastRatio(rgb(0x76, 0x76, 0x76), WHITE)).toBeGreaterThan(4.5);
    expect(contrastRatio(rgb(0x80, 0x80, 0x80), WHITE)).toBeLessThan(4.5);
  });

  it('puts black on light colours and white on dark ones', () => {
    expect(readableTextOn(rgb(255, 235, 100))).toEqual(BLACK);
    expect(readableTextOn(rgb(10, 20, 60))).toEqual(WHITE);
  });
});

describe('sampling', () => {
  it('spreads the sample over the whole image rather than the top of it', () => {
    // Red first half, blue second half. A sample of the first N would see red.
    const data = pixels([
      [rgb(255, 0, 0), 5000],
      [rgb(0, 0, 255), 5000],
    ]);
    const got = samplePixels(data, 100, 100, 100);
    expect(got.some((p) => p.b === 255)).toBe(true);
    expect(got.some((p) => p.r === 255)).toBe(true);
  });

  it('skips pixels that are mostly transparent', () => {
    const data = pixels([[rgb(255, 0, 0), 10]], 0);
    expect(samplePixels(data, 10, 1, 100)).toEqual([]);
  });

  it('copes with an empty image', () => {
    expect(samplePixels(new Uint8ClampedArray(0), 0, 0)).toEqual([]);
  });
});

describe('the palette', () => {
  it('finds the colours actually in the image', () => {
    const source = [
      ...Array(60).fill(rgb(200, 30, 30)),
      ...Array(30).fill(rgb(30, 200, 30)),
      ...Array(10).fill(rgb(30, 30, 200)),
    ];
    const palette = extractPalette(source, 3);
    expect(palette.map((s) => s.hex)).toEqual(['#c81e1e', '#1ec81e', '#1e1ec8']);
  });

  it('orders by how much of the image each colour covers, not by hue', () => {
    const source = [
      ...Array(10).fill(rgb(250, 250, 250)),
      ...Array(70).fill(rgb(10, 10, 10)),
      ...Array(20).fill(rgb(250, 10, 10)),
    ];
    const palette = extractPalette(source, 3);
    expect(palette.map((s) => Math.round(s.share * 100))).toEqual([70, 20, 10]);
    expect(palette[0]!.hex).toBe('#0a0a0a');
  });

  it('offers only colours the image really contains, never an average of two', () => {
    // The mean of these two is a mid grey that appears nowhere in the source.
    const source = [...Array(50).fill(rgb(255, 0, 0)), ...Array(50).fill(rgb(0, 0, 255))];
    for (const swatch of extractPalette(source, 2)) {
      expect(source.some((p) => p.r === swatch.rgb.r && p.b === swatch.rgb.b)).toBe(true);
    }
  });

  it('returns fewer swatches rather than duplicates when the image is plain', () => {
    const source = Array(100).fill(rgb(20, 120, 220));
    const palette = extractPalette(source, 6);
    expect(palette).toHaveLength(1);
    expect(palette[0]!.share).toBe(1);
  });

  it('shares add up to the whole image', () => {
    const source = [
      ...Array(37).fill(rgb(10, 20, 30)),
      ...Array(41).fill(rgb(200, 190, 180)),
      ...Array(22).fill(rgb(90, 10, 160)),
    ];
    const total = extractPalette(source, 5).reduce((n, s) => n + s.share, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('keeps a minority colour instead of collapsing to a duplicate', () => {
    // Mostly black, a little white, some red. A split can fall inside the black
    // run and leave both halves nearest to black; naively dropping the
    // duplicate would lose the white altogether.
    const source = [
      ...Array(10).fill(rgb(250, 250, 250)),
      ...Array(70).fill(rgb(10, 10, 10)),
      ...Array(20).fill(rgb(250, 10, 10)),
    ];
    const palette = extractPalette(source, 3);
    expect(palette).toHaveLength(3);
    expect(palette.map((s) => s.hex).sort()).toEqual(['#0a0a0a', '#fa0a0a', '#fafafa']);
  });

  it('asks for nothing and gets nothing', () => {
    expect(extractPalette([], 5)).toEqual([]);
    expect(extractPalette([rgb(1, 2, 3)], 0)).toEqual([]);
  });
});
