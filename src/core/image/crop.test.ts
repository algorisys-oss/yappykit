import { describe, it, expect } from 'vitest';
import { fitAspect, cropToPixels, ASPECTS, type Rect } from './crop';

const near = (got: Rect, want: number[]) => {
  expect(got.x).toBeCloseTo(want[0]!, 5);
  expect(got.y).toBeCloseTo(want[1]!, 5);
  expect(got.w).toBeCloseTo(want[2]!, 5);
  expect(got.h).toBeCloseTo(want[3]!, 5);
};

describe('fitAspect', () => {
  it('leaves a free selection exactly as drawn', () => {
    const r = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 };
    expect(fitAspect(r, null, 1000, 1000)).toEqual(r);
  });

  it('narrows a too-wide selection to the ratio, keeping its centre', () => {
    // 0.8 wide by 0.4 tall on a square image is 2:1; forcing 1:1 must shrink
    // the width to match the height rather than grow the height.
    const r = fitAspect({ x: 0.1, y: 0.3, w: 0.8, h: 0.4 }, 1, 1000, 1000);
    near(r, [0.3, 0.3, 0.4, 0.4]);
  });

  it('narrows a too-tall selection the same way', () => {
    const r = fitAspect({ x: 0.3, y: 0.1, w: 0.4, h: 0.8 }, 1, 1000, 1000);
    near(r, [0.3, 0.3, 0.4, 0.4]);
  });

  it('accounts for a non-square image, since a fraction is not a shape', () => {
    // On a 2000x1000 image, 1:1 in pixels is 2:1 in fractions.
    const r = fitAspect({ x: 0, y: 0, w: 1, h: 1 }, 1, 2000, 1000);
    expect(r.w * 2000).toBeCloseTo(r.h * 1000, 3);
  });

  it('handles a wide ratio like 16:9', () => {
    const r = fitAspect({ x: 0, y: 0, w: 1, h: 1 }, 16 / 9, 1000, 1000);
    expect((r.w * 1000) / (r.h * 1000)).toBeCloseTo(16 / 9, 3);
  });

  it('never leaves the image after fitting', () => {
    const r = fitAspect({ x: 0.9, y: 0.9, w: 0.3, h: 0.3 }, 1, 1000, 1000);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1.000001);
    expect(r.y + r.h).toBeLessThanOrEqual(1.000001);
  });
});

describe('cropToPixels', () => {
  it('turns a fraction into whole pixels', () => {
    expect(cropToPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 400)).toEqual({ x: 200, y: 200, w: 400, h: 100 });
  });

  it('never runs past the edge', () => {
    const r = cropToPixels({ x: 0.95, y: 0.95, w: 0.2, h: 0.2 }, 100, 100);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });

  it('always yields at least one pixel', () => {
    const r = cropToPixels({ x: 0.5, y: 0.5, w: 0, h: 0 }, 100, 100);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});

describe('aspect presets', () => {
  it('offers the ratios people are asked for, plus a free option', () => {
    const ids = ASPECTS.map((a) => a.id);
    expect(ids).toContain('free');
    expect(ids).toContain('1:1');
    expect(ids).toContain('16:9');
  });

  it('gives free a null ratio, so nothing constrains it', () => {
    expect(ASPECTS.find((a) => a.id === 'free')!.ratio).toBeNull();
  });

  it('states each ratio as a number the geometry can use', () => {
    expect(ASPECTS.find((a) => a.id === '16:9')!.ratio).toBeCloseTo(16 / 9, 6);
    expect(ASPECTS.find((a) => a.id === '4:3')!.ratio).toBeCloseTo(4 / 3, 6);
  });
});
