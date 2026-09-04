import { describe, it, expect } from 'vitest';
import {
  placements,
  defaultsFor,
  CROP_GUARD,
  type Anchor,
  type Size,
  type WatermarkSpec,
} from './watermark';

/**
 * The planner decides where every copy of a mark goes without ever touching a
 * pixel, so the thing worth asserting is the promise each mode makes.
 *
 * "Sign it" promises one mark, where you asked for it, inside the margin.
 * "Protect it" promises the mark survives a crop, and that is checked the way a
 * person would check it: cut the image down and look for a mark in what is
 * left.
 */

const img = (width: number, height: number): Size => ({ width, height });

/** A mark of the given aspect, sized in the arbitrary units a caller measures in. */
const mark = (aspect: number): Size => ({ width: aspect * 40, height: 40 });

const sign = (over: Partial<WatermarkSpec> = {}): WatermarkSpec => ({
  ...defaultsFor('sign'),
  ...over,
});
const protect = (over: Partial<WatermarkSpec> = {}): WatermarkSpec => ({
  ...defaultsFor('protect'),
  ...over,
});

describe('defaultsFor', () => {
  it('signs flat and in a corner, protects rotated and tiled', () => {
    expect(defaultsFor('sign').angleDeg).toBe(0);
    expect(defaultsFor('sign').anchor).toBe('bottom-right');
    expect(defaultsFor('protect').angleDeg).not.toBe(0);
    expect(defaultsFor('protect').purpose).toBe('protect');
  });

  it('signs more visibly than it protects', () => {
    // A signature is meant to be read; a protective tile is meant to be
    // present without ruining the picture underneath it.
    expect(defaultsFor('sign').opacity).toBeGreaterThan(defaultsFor('protect').opacity);
  });
});

describe('placements — sign', () => {
  it('places exactly one mark', () => {
    expect(placements(img(1000, 800), mark(3), sign())).toHaveLength(1);
  });

  it('sizes the mark from the shorter side, so a batch of mixed sizes matches', () => {
    const small = placements(img(600, 400), mark(2), sign({ scale: 0.1 }))[0]!;
    const large = placements(img(3000, 2000), mark(2), sign({ scale: 0.1 }))[0]!;

    expect(small.h).toBeCloseTo(40); // 10% of the 400px short side
    expect(large.h).toBeCloseTo(200);
    // Same fraction of the image either way — that is what makes one spec work
    // across a batch of different-sized photographs.
    expect(small.h / 400).toBeCloseTo(large.h / 2000);
  });

  it('keeps the mark aspect ratio', () => {
    const p = placements(img(1000, 1000), mark(2.5), sign())[0]!;
    expect(p.w / p.h).toBeCloseTo(2.5);
  });

  it('contains a very wide mark within the width cap instead of overflowing', () => {
    const p = placements(img(1000, 1000), mark(20), sign({ scale: 0.2, maxWidth: 0.4 }))[0]!;
    expect(p.w).toBeLessThanOrEqual(400.001);
    expect(p.w / p.h).toBeCloseTo(20);
  });

  it('never lets the mark leave the image', () => {
    const anchors: Anchor[] = [
      'top-left', 'top', 'top-right',
      'left', 'center', 'right',
      'bottom-left', 'bottom', 'bottom-right',
    ];
    for (const anchor of anchors) {
      const p = placements(img(900, 1200), mark(4), sign({ anchor, scale: 0.12 }))[0]!;
      expect(p.x - p.w / 2, anchor).toBeGreaterThanOrEqual(-0.001);
      expect(p.x + p.w / 2, anchor).toBeLessThanOrEqual(900.001);
      expect(p.y - p.h / 2, anchor).toBeGreaterThanOrEqual(-0.001);
      expect(p.y + p.h / 2, anchor).toBeLessThanOrEqual(1200.001);
    }
  });

  it('puts each anchor in its own corner of the frame', () => {
    const at = (anchor: Anchor) => placements(img(1000, 1000), mark(2), sign({ anchor }))[0]!;
    expect(at('top-left').x).toBeLessThan(at('top-right').x);
    expect(at('top-left').y).toBeLessThan(at('bottom-left').y);
    expect(at('center').x).toBeCloseTo(500);
    expect(at('center').y).toBeCloseTo(500);
  });

  it('honours the inset, measured off the shorter side', () => {
    const p = placements(img(1000, 500), mark(1), sign({ anchor: 'top-left', inset: 0.04 }))[0]!;
    expect(p.x - p.w / 2).toBeCloseTo(20); // 4% of 500
    expect(p.y - p.h / 2).toBeCloseTo(20);
  });
});

describe('placements — protect', () => {
  it('tiles the frame', () => {
    expect(placements(img(1000, 1000), mark(4), protect()).length).toBeGreaterThan(4);
  });

  it('rotates every tile to the angle asked for', () => {
    for (const p of placements(img(1000, 1000), mark(4), protect({ angleDeg: -30 }))) {
      expect(p.angleDeg).toBe(-30);
    }
  });

  it('staggers alternate rows, so a narrow crop cannot slip between columns', () => {
    // Unrotated, so a lattice row is still a horizontal row of the image and
    // can be grouped by y. At an angle the same rows are diagonals.
    const all = placements(img(1200, 1200), mark(3), protect({ angleDeg: 0 }));
    const rows = new Map<number, number[]>();
    for (const p of all) {
      const key = Math.round(p.y * 100);
      rows.set(key, [...(rows.get(key) ?? []), p.x]);
    }
    const populated = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, xs]) => xs);
    expect(populated.length).toBeGreaterThan(1);
    const [a, b] = populated;
    const shared = a!.some((x) => b!.some((y) => Math.abs(x - y) < 0.5));
    expect(shared, 'neighbouring rows must not share a column').toBe(false);
  });

  it('survives a crop', () => {
    // The promise of the mode, checked the way it would be broken: take the
    // image apart into every crop that keeps CROP_GUARD of each side and
    // confirm a mark centre is inside each one.
    const cases: { size: Size; aspect: number; spec: WatermarkSpec }[] = [
      { size: img(1000, 1000), aspect: 4, spec: protect() },
      { size: img(4000, 3000), aspect: 8, spec: protect() },
      { size: img(640, 1400), aspect: 1, spec: protect({ tileGap: 1.2 }) },
      { size: img(1200, 400), aspect: 12, spec: protect({ angleDeg: -45 }) },
      { size: img(800, 800), aspect: 0.4, spec: protect({ angleDeg: 0 }) },
      // A scale far larger than the mode can honour must still be crop-safe.
      { size: img(1500, 1000), aspect: 6, spec: protect({ scale: 0.5 }) },
    ];

    for (const { size, aspect, spec } of cases) {
      const marks = placements(size, mark(aspect), spec);
      const cw = size.width * CROP_GUARD;
      const ch = size.height * CROP_GUARD;
      const label = `${size.width}x${size.height} aspect ${aspect} angle ${spec.angleDeg}`;

      for (let x = 0; x + cw <= size.width; x += cw / 2) {
        for (let y = 0; y + ch <= size.height; y += ch / 2) {
          const hit = marks.some(
            (p) => p.x >= x && p.x <= x + cw && p.y >= y && p.y <= y + ch,
          );
          expect(hit, `${label}: crop at ${Math.round(x)},${Math.round(y)} has no mark`).toBe(true);
        }
      }
    }
  });

  it('shrinks a mark that is too big to tile safely, rather than breaking the promise', () => {
    const greedy = placements(img(1000, 1000), mark(4), protect({ scale: 0.5 }))[0]!;
    // 50% of the short side would be 500px tall. Crop resistance caps it.
    expect(greedy.h).toBeLessThan(500);
    expect(greedy.w / greedy.h).toBeCloseTo(4);
  });

  it('never overlaps its own tiles', () => {
    const all = placements(img(2000, 1500), mark(5), protect({ angleDeg: 0 }));
    expect(all.length).toBeGreaterThan(2);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const apart =
          Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 0.001 ||
          Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 0.001;
        expect(apart, `tiles ${i} and ${j} overlap`).toBe(true);
      }
    }
  });
});

describe('placements — degenerate input', () => {
  it('returns nothing for an empty image', () => {
    expect(placements(img(0, 0), mark(2), sign())).toEqual([]);
    expect(placements(img(100, 0), mark(2), protect())).toEqual([]);
  });

  it('returns nothing for a mark with no size', () => {
    expect(placements(img(100, 100), { width: 0, height: 0 }, sign())).toEqual([]);
    expect(placements(img(100, 100), { width: 10, height: 0 }, protect())).toEqual([]);
  });

  it('is deterministic', () => {
    const once = placements(img(1234, 987), mark(3.5), protect());
    const twice = placements(img(1234, 987), mark(3.5), protect());
    expect(once).toEqual(twice);
  });
});
