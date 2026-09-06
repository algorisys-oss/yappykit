import { describe, it, expect } from 'vitest';
import { rectFromDrag, toPixels, isDegenerate, MIN_FRACTION } from './regions';

/** Fractions are floats: 0.6 - 0.2 is 0.3999..., so compare with tolerance. */
const expectRect = (got: { x: number; y: number; w: number; h: number }, want: number[]) => {
  expect(got.x).toBeCloseTo(want[0]!, 6);
  expect(got.y).toBeCloseTo(want[1]!, 6);
  expect(got.w).toBeCloseTo(want[2]!, 6);
  expect(got.h).toBeCloseTo(want[3]!, 6);
};

describe('rectFromDrag', () => {
  it('handles a drag down and to the right', () => {
    expectRect(rectFromDrag({ x: 0.2, y: 0.1 }, { x: 0.6, y: 0.5 }), [0.2, 0.1, 0.4, 0.4]);
  });

  it('handles a drag up and to the left, which people do constantly', () => {
    // Dragging from bottom-right to top-left must produce the same rectangle,
    // not a negative-width one that draws as nothing.
    expectRect(rectFromDrag({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), [0.2, 0.1, 0.4, 0.4]);
  });

  it('handles the two mixed directions too', () => {
    expectRect(rectFromDrag({ x: 0.6, y: 0.1 }, { x: 0.2, y: 0.5 }), [0.2, 0.1, 0.4, 0.4]);
    expectRect(rectFromDrag({ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.1 }), [0.2, 0.1, 0.4, 0.4]);
  });

  it('clamps a drag that left the image', () => {
    // A pointer can travel outside the element; the region must not.
    const r = rectFromDrag({ x: -0.5, y: -0.2 }, { x: 1.4, y: 1.9 });
    expect(r).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('isDegenerate', () => {
  it('rejects a click that never became a drag', () => {
    expect(isDegenerate({ x: 0.5, y: 0.5, w: 0, h: 0 })).toBe(true);
    expect(isDegenerate({ x: 0.5, y: 0.5, w: MIN_FRACTION / 2, h: 0.3 })).toBe(true);
  });

  it('accepts a real selection', () => {
    expect(isDegenerate({ x: 0.1, y: 0.1, w: 0.2, h: 0.05 })).toBe(false);
  });
});

describe('toPixels', () => {
  it('maps a fraction onto the real image, rounding outward', () => {
    // Rounding outward matters: a region that rounds inward can leave a line of
    // the original pixels showing along the edge of the box.
    expect(toPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 400)).toEqual({ x: 200, y: 200, w: 400, h: 100 });
    expect(toPixels({ x: 0.101, y: 0.101, w: 0.1, h: 0.1 }, 1000, 1000)).toEqual({ x: 101, y: 101, w: 100, h: 100 });
  });

  it('never runs past the edge of the image', () => {
    const r = toPixels({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 100, 100);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });

  it('always covers at least one pixel, so a thin region still redacts', () => {
    const r = toPixels({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, 100, 100);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});
