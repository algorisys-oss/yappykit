import { describe, it, expect } from 'vitest';
import {
  MAX_STEP_S,
  createBurst, stepParticles, isSpent, type Particle,
} from './confetti';

const PALETTE = ['#e11d48', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];
const W = 800;
const H = 600;

function particle(over: Partial<Particle> = {}): Particle {
  return { x: 400, y: 100, vx: 0, vy: 0, rotation: 0, spin: 0, color: '#fff', size: 10, ...over };
}

describe('seeded bursts', () => {
  it('produces the identical burst for the same seed', () => {
    expect(createBurst(50, W, H, 7, PALETTE)).toEqual(createBurst(50, W, H, 7, PALETTE));
  });

  it('produces a different burst for a different seed', () => {
    expect(createBurst(50, W, H, 7, PALETTE)).not.toEqual(createBurst(50, W, H, 8, PALETTE));
  });
});

describe('createBurst', () => {
  it('makes exactly the requested number of particles', () => {
    expect(createBurst(120, W, H, 1, PALETTE)).toHaveLength(120);
  });

  it('makes nothing from a non-positive count, or with no colours to draw', () => {
    expect(createBurst(0, W, H, 1, PALETTE)).toEqual([]);
    expect(createBurst(-10, W, H, 1, PALETTE)).toEqual([]);
    expect(createBurst(50, W, H, 1, [])).toEqual([]);
  });

  it('originates around the upper middle of the area', () => {
    for (const p of createBurst(200, W, H, 3, PALETTE)) {
      expect(p.x).toBeGreaterThan(W * 0.4);
      expect(p.x).toBeLessThan(W * 0.6);
      expect(p.y).toBeGreaterThan(H * 0.1);
      expect(p.y).toBeLessThan(H * 0.4);
    }
  });

  it('throws every piece upward to begin with', () => {
    for (const p of createBurst(200, W, H, 4, PALETTE)) expect(p.vy).toBeLessThan(0);
  });

  it('fans outward to both sides rather than straight up', () => {
    const burst = createBurst(200, W, H, 5, PALETTE);
    expect(burst.some((p) => p.vx < -50)).toBe(true);
    expect(burst.some((p) => p.vx > 50)).toBe(true);
  });

  it('takes its colours only from the palette it was given', () => {
    for (const p of createBurst(200, W, H, 6, PALETTE)) expect(PALETTE).toContain(p.color);
    for (const p of createBurst(20, W, H, 6, ['#123456'])) expect(p.color).toBe('#123456');
  });

  it('varies colour, size and spin across the burst', () => {
    const burst = createBurst(200, W, H, 9, PALETTE);
    expect(new Set(burst.map((p) => p.color)).size).toBe(PALETTE.length);
    expect(new Set(burst.map((p) => p.size)).size).toBeGreaterThan(50);
    expect(burst.some((p) => p.spin < 0)).toBe(true);
    expect(burst.some((p) => p.spin > 0)).toBe(true);
  });

  it('gives every piece a positive size', () => {
    for (const p of createBurst(200, W, H, 11, PALETTE)) expect(p.size).toBeGreaterThan(0);
  });
});

describe('stepParticles', () => {
  it('carries a particle along its velocity', () => {
    const [p] = stepParticles([particle({ x: 100, y: 100, vx: 200, vy: 0 })], 0.02, H);
    expect(p!.x).toBeGreaterThan(100);
    expect(p!.y).toBeGreaterThan(100);
  });

  it('pulls a still particle downward', () => {
    const [p] = stepParticles([particle({ vy: 0 })], 0.02, H);
    expect(p!.vy).toBeGreaterThan(0);
  });

  it('bleeds off sideways speed through drag', () => {
    const [p] = stepParticles([particle({ vx: 400 })], 0.02, H);
    expect(p!.vx).toBeLessThan(400);
    expect(p!.vx).toBeGreaterThan(0);
  });

  it('rotates by the spin over the elapsed time', () => {
    const [p] = stepParticles([particle({ rotation: 1, spin: 4 })], 0.02, H);
    expect(p!.rotation).toBeCloseTo(1.08, 9);
  });

  it('lands in the same place at 60Hz and at 144Hz', () => {
    const start = createBurst(60, W, 5000, 12, PALETTE);
    let slow = start;
    let fast = start;
    for (let i = 0; i < 60; i++) slow = stepParticles(slow, 1 / 60, 5000);
    for (let i = 0; i < 144; i++) fast = stepParticles(fast, 1 / 144, 5000);
    expect(fast).toHaveLength(slow.length);
    // Not bit-identical — two different integration step sizes never are — but
    // a few pixels apart after a second of travel, not a different burst.
    for (let i = 0; i < slow.length; i++) {
      expect(Math.abs(fast[i]!.x - slow[i]!.x)).toBeLessThan(4);
      expect(Math.abs(fast[i]!.y - slow[i]!.y)).toBeLessThan(4);
    }
  });

  it('clamps a huge dt so a woken background tab does not teleport everything', () => {
    const start = [particle({ vx: 300, vy: -400 })];
    expect(stepParticles(start, 30, 5000)).toEqual(stepParticles(start, MAX_STEP_S, 5000));
  });

  it('treats a negative or non-finite dt as no time passing', () => {
    const start = [particle({ vx: 300, vy: -400, spin: 3 })];
    expect(stepParticles(start, -1, H)).toEqual(start);
    expect(stepParticles(start, NaN, H)).toEqual(start);
  });

  it('drops the pieces that have fallen past the bottom', () => {
    const survivors = stepParticles(
      [particle({ y: H + 200 }), particle({ y: H / 2 })],
      1 / 60,
      H,
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.y).toBeLessThan(H);
  });

  it('keeps a piece that is only just crossing the bottom edge', () => {
    expect(stepParticles([particle({ y: H, size: 10 })], 1 / 60, H)).toHaveLength(1);
  });

  it('leaves an empty burst empty', () => {
    expect(stepParticles([], 1 / 60, H)).toEqual([]);
  });
});

describe('isSpent', () => {
  it('is spent only once nothing is left on screen', () => {
    expect(isSpent(createBurst(20, W, H, 2, PALETTE))).toBe(false);
    expect(isSpent([])).toBe(true);
  });

  it('reports a burst spent after it has all fallen through', () => {
    let ps = createBurst(80, W, H, 13, PALETTE);
    for (let i = 0; i < 60 * 20 && !isSpent(ps); i++) ps = stepParticles(ps, 1 / 60, H);
    expect(isSpent(ps)).toBe(true);
  });
});
