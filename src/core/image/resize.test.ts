import { describe, it, expect } from 'vitest';
import { planResize, PRESETS, presetLabelKeys } from './resize';

const src = (width: number, height: number) => ({ width, height });

describe('planResize, cover', () => {
  it('uses the whole source when the shapes already match', () => {
    const plan = planResize(src(1000, 1000), src(500, 500), 'cover');
    expect(plan.source).toEqual({ x: 0, y: 0, w: 1000, h: 1000 });
    expect(plan.dest).toEqual({ x: 0, y: 0, w: 500, h: 500 });
    expect(plan.cropped).toBe(false);
    expect(plan.padded).toBe(false);
  });

  it('crops the sides of a wide photo into a square, centred', () => {
    const plan = planResize(src(2000, 1000), src(500, 500), 'cover');
    // A 1000-wide window centred in 2000: 500 trimmed from each side.
    expect(plan.source).toEqual({ x: 500, y: 0, w: 1000, h: 1000 });
    expect(plan.cropped).toBe(true);
  });

  it('crops the top and bottom of a tall photo, centred', () => {
    const plan = planResize(src(1000, 2000), src(500, 500), 'cover');
    expect(plan.source).toEqual({ x: 0, y: 500, w: 1000, h: 1000 });
    expect(plan.cropped).toBe(true);
  });

  it('fills the target exactly, which is the whole promise', () => {
    const plan = planResize(src(1234, 567), src(800, 600), 'cover');
    expect(plan.dest.w).toBe(800);
    expect(plan.dest.h).toBe(600);
    expect(plan.dest.x).toBe(0);
    expect(plan.dest.y).toBe(0);
  });
});

describe('planResize, contain', () => {
  it('fits a wide photo inside the box and pads above and below', () => {
    const plan = planResize(src(2000, 1000), src(500, 500), 'contain');
    expect(plan.source).toEqual({ x: 0, y: 0, w: 2000, h: 1000 });
    expect(plan.dest).toEqual({ x: 0, y: 125, w: 500, h: 250 });
    expect(plan.padded).toBe(true);
    expect(plan.cropped).toBe(false);
  });

  it('fits a tall photo inside the box and pads left and right', () => {
    const plan = planResize(src(1000, 2000), src(500, 500), 'contain');
    expect(plan.dest).toEqual({ x: 125, y: 0, w: 250, h: 500 });
    expect(plan.padded).toBe(true);
  });

  it('does not pad when the shapes match', () => {
    expect(planResize(src(800, 600), src(400, 300), 'contain').padded).toBe(false);
  });
});

describe('planResize, honesty about quality', () => {
  it('says when the result is an upscale, which invents no detail', () => {
    expect(planResize(src(200, 200), src(1000, 1000), 'cover').upscaled).toBe(true);
    expect(planResize(src(2000, 2000), src(1000, 1000), 'cover').upscaled).toBe(false);
  });

  it('counts an upscale in either direction', () => {
    // Wide but short: made bigger vertically even though width shrinks.
    expect(planResize(src(4000, 100), src(1000, 1000), 'contain').upscaled).toBe(true);
  });
});

describe('planResize, edges', () => {
  it('never produces a zero-sized draw', () => {
    const plan = planResize(src(3000, 2), src(500, 500), 'contain');
    expect(plan.dest.w).toBeGreaterThanOrEqual(1);
    expect(plan.dest.h).toBeGreaterThanOrEqual(1);
  });

  it('keeps the crop window inside the source', () => {
    const plan = planResize(src(999, 501), src(500, 500), 'cover');
    expect(plan.source.x).toBeGreaterThanOrEqual(0);
    expect(plan.source.y).toBeGreaterThanOrEqual(0);
    expect(plan.source.x + plan.source.w).toBeLessThanOrEqual(999);
    expect(plan.source.y + plan.source.h).toBeLessThanOrEqual(501);
  });

  it('handles a one-pixel target without falling apart', () => {
    const plan = planResize(src(1000, 1000), src(1, 1), 'cover');
    expect(plan.dest).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('presets', () => {
  it('offers sizes people are actually asked for', () => {
    const sizes = PRESETS.map((p) => `${p.width}x${p.height}`);
    expect(sizes).toContain('1080x1080');
    expect(sizes).toContain('1280x720');
  });

  it('gives every preset a label key, so none renders blank', () => {
    for (const key of presetLabelKeys()) expect(key).toMatch(/^preset[A-Za-z0-9]+$/);
  });
});
