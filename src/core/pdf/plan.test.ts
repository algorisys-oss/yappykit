import { describe, it, expect } from 'vitest';
import {
  POINTS_PER_INCH, BASE_DPI, MAX_RENDER_PX, TEXT_CHARS_PER_PAGE,
  dpiToScale, scaleToDpi, renderSize, hasMeaningfulText, summarise,
} from './plan';

describe('dpi and scale', () => {
  it('treats a PDF point as 1/72 inch', () => {
    expect(POINTS_PER_INCH).toBe(72);
    expect(dpiToScale(72)).toBe(1);
    expect(scaleToDpi(1)).toBe(72);
  });

  it('round-trips', () => {
    for (const dpi of [72, 96, 150, 200, 300]) {
      expect(scaleToDpi(dpiToScale(dpi))).toBeCloseTo(dpi, 9);
    }
  });

  it('doubles the pixels when the dpi doubles', () => {
    expect(dpiToScale(144)).toBeCloseTo(dpiToScale(72) * 2, 9);
  });
});

describe('renderSize', () => {
  // US Letter is 612 x 792 pt.
  it('renders a Letter page at the requested resolution', () => {
    const r = renderSize(612, 792, dpiToScale(BASE_DPI));
    expect(r.width).toBe(Math.round((612 / 72) * 200));
    expect(r.height).toBe(Math.round((792 / 72) * 200));
    expect(r.clamped).toBe(false);
  });

  it('clamps an enormous page instead of allocating a canvas that would fail', () => {
    // A0 is 2384 x 3370 pt; at 200 dpi the long edge would be ~9360 px.
    const r = renderSize(2384, 3370, dpiToScale(BASE_DPI));
    expect(r.clamped).toBe(true);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_RENDER_PX);
  });

  it('preserves the aspect ratio when clamping', () => {
    const r = renderSize(2384, 3370, dpiToScale(BASE_DPI));
    expect(r.width / r.height).toBeCloseTo(2384 / 3370, 3);
  });

  it('never returns a zero dimension, which would throw on canvas creation', () => {
    const r = renderSize(0.4, 792, 0.01);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });

  it('scales down proportionally below full size', () => {
    const full = renderSize(612, 792, 1);
    const half = renderSize(612, 792, 0.5);
    expect(half.width).toBe(Math.round(full.width / 2));
  });
});

describe('text detection', () => {
  it('flags a text document so the user can be warned before it is rasterised', () => {
    expect(hasMeaningfulText(4000, 3)).toBe(true);
  });

  it('does not flag a scan carrying a few stray characters', () => {
    expect(hasMeaningfulText(12, 3)).toBe(false);
  });

  it('averages per page, so one text cover page on a long scan does not trigger it', () => {
    // 900 chars on a 50-page scan: 18 per page.
    expect(hasMeaningfulText(900, 50)).toBe(false);
  });

  it('still flags a single text-heavy page', () => {
    expect(hasMeaningfulText(TEXT_CHARS_PER_PAGE, 1)).toBe(true);
  });

  it('is false for an empty document rather than dividing by zero', () => {
    expect(hasMeaningfulText(0, 0)).toBe(false);
    expect(Number.isNaN(Number(hasMeaningfulText(10, 0)))).toBe(false);
  });
});

describe('summarise', () => {
  it('reports a fit with the achieved saving', () => {
    const s = summarise(1_000_000, 250_000, true, 1);
    expect(s.outcome).toBe('fit');
    expect(s.percentSmaller).toBe(75);
  });

  it('reports hitting the floor when the budget could not be met', () => {
    expect(summarise(1_000_000, 400_000, false, 1).outcome).toBe('floor');
  });

  it('refuses to claim a saving when the rebuild made the file bigger', () => {
    // A small vector PDF re-rendered as images can legitimately grow.
    expect(summarise(50_000, 90_000, false, 1).percentSmaller).toBeNull();
  });

  it('reports the effective resolution so the quality claim is checkable', () => {
    expect(summarise(100, 50, true, 1).dpi).toBe(BASE_DPI);
    expect(summarise(100, 50, true, 0.5).dpi).toBe(BASE_DPI / 2);
  });
});
