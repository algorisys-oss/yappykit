import { describe, it, expect } from 'vitest';
import { fitView, MAX_SCALE, MIN_SCALE, zoomAt } from './viewport';

describe('zoomAt', () => {
  it('keeps the point under the cursor still', () => {
    const v = { scale: 1, x: 10, y: 20 };
    const next = zoomAt(v, 2, 110, 70);
    // Diagram point under (110, 70) before: ((110-10)/1, (70-20)/1) = (100, 50).
    expect(next.scale).toBe(2);
    expect(next.x + 100 * next.scale).toBeCloseTo(110);
    expect(next.y + 50 * next.scale).toBeCloseTo(70);
  });

  it('stops at the limits without drifting', () => {
    const top = zoomAt({ scale: MAX_SCALE, x: 5, y: 5 }, 2, 50, 50);
    expect(top).toEqual({ scale: MAX_SCALE, x: 5, y: 5 });
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.0001, 0, 0).scale).toBe(MIN_SCALE);
  });
});

describe('fitView', () => {
  it('shrinks a large diagram to fit and centres it', () => {
    const v = fitView(2000, 500, 1016, 616);
    expect(v.scale).toBeCloseTo(0.492);
    expect(v.x).toBeCloseTo((1016 - 2000 * v.scale) / 2);
    expect(v.y).toBeCloseTo((616 - 500 * v.scale) / 2);
  });

  it('never enlarges a small one', () => {
    expect(fitView(100, 50, 1000, 1000)).toEqual({ scale: 1, x: 450, y: 475 });
  });

  it('is identity before anything has a size', () => {
    expect(fitView(0, 0, 500, 500)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
