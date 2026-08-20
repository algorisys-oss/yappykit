import { describe, it, expect } from 'vitest';
import { presetPixels, planPrintSheet, PHOTO_PRESETS } from './presets';
import { computeCrop } from './crop';

describe('presetPixels', () => {
  it('derives 600×600 for a US 2×2 in photo at 300 DPI', () => {
    const us = PHOTO_PRESETS.find((p) => p.id === 'us-visa')!;
    expect(presetPixels(us)).toEqual({ width: 600, height: 600 });
  });

  it('derives portrait pixels for a 35×45 mm photo', () => {
    const schengen = PHOTO_PRESETS.find((p) => p.id === 'schengen')!;
    const px = presetPixels(schengen);
    expect(px.width).toBeLessThan(px.height); // portrait
    // 35mm @600dpi ≈ 827
    expect(px.width).toBe(827);
  });
});

describe('planPrintSheet', () => {
  it('fits multiple US photos on a 4×6 sheet', () => {
    const us = PHOTO_PRESETS.find((p) => p.id === 'us-visa')!;
    const plan = planPrintSheet(us);
    expect(plan.count).toBeGreaterThanOrEqual(4); // 2×2in photos on 6×4in → at least 4
    expect(plan.cols * plan.rows).toBe(plan.count);
    expect(plan.marginX).toBeGreaterThanOrEqual(0);
    expect(plan.marginY).toBeGreaterThanOrEqual(0);
  });
});

describe('computeCrop', () => {
  it('produces a centered crop of the target aspect at zoom 1', () => {
    const c = computeCrop({ sourceWidth: 1000, sourceHeight: 1000, targetAspect: 1, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(c).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
  });

  it('crops to target aspect from a wider source', () => {
    // 2:1 source, square target → base crop is 500×500 (height-limited... width-limited here)
    const c = computeCrop({ sourceWidth: 2000, sourceHeight: 1000, targetAspect: 1, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(c.sw).toBe(1000);
    expect(c.sh).toBe(1000);
    expect(c.sx).toBe(500); // centered horizontally
    expect(c.sy).toBe(0);
  });

  it('zoom shrinks the crop rectangle', () => {
    const c = computeCrop({ sourceWidth: 1000, sourceHeight: 1000, targetAspect: 1, zoom: 2, offsetX: 0, offsetY: 0 });
    expect(c.sw).toBe(500);
    expect(c.sh).toBe(500);
    expect(c.sx).toBe(250); // centered
  });

  it('clamps pan so the crop never leaves the source bounds', () => {
    const c = computeCrop({ sourceWidth: 1000, sourceHeight: 1000, targetAspect: 1, zoom: 2, offsetX: 5, offsetY: -5 });
    expect(c.sx).toBe(500); // maxX = 500, fully panned right
    expect(c.sy).toBe(0); // fully panned up
    expect(c.sx + c.sw).toBeLessThanOrEqual(1000);
    expect(c.sy + c.sh).toBeGreaterThanOrEqual(0);
  });
});
