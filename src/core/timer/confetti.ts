/**
 * The celebration burst the timer fires when it reaches zero.
 *
 * All of the motion lives here, as pure functions over plain particles, and
 * nothing in this file touches a canvas or the DOM. A confetti burst is the
 * kind of code that is never wrong in an obvious way — it is wrong by drifting,
 * teleporting or never finishing — so the physics is kept where a test can
 * watch it, and the component is left with nothing to do but draw.
 *
 * THE RANDOMNESS IS SEEDED, which is what makes any of it testable. A burst
 * built from `Math.random` has no reproducible starting state, so "does it fan
 * outward" and "does it look the same at 144Hz" become claims rather than
 * assertions. mulberry32 is nine lines and gives the same burst for the same
 * seed on every machine.
 *
 * Motion is a function of ELAPSED TIME, never of frame count, so a 144Hz
 * display sees the same burst as a 60Hz one rather than one running at 2.4x.
 */

export interface Particle {
  readonly x: number;
  readonly y: number;
  /** Velocity in CSS pixels per second. */
  readonly vx: number;
  readonly vy: number;
  /** Radians, and radians per second. */
  readonly rotation: number;
  readonly spin: number;
  readonly color: string;
  /** Length of the piece's long edge, in CSS pixels. */
  readonly size: number;
}

/** Pixels per second squared, and a per-second air-drag coefficient. */
const GRAVITY = 900;
const DRAG = 2.2;

/**
 * The longest step the simulation will take, whatever the caller passes.
 *
 * A backgrounded tab stops getting animation frames entirely, so the first
 * frame after it wakes reports the whole time it was hidden — seconds, or
 * minutes. Integrated straight, that single step throws every piece far off
 * screen and the burst ends before it is drawn once. Clamping turns the
 * gap into one ordinary frame instead.
 */
export const MAX_STEP_S = 1 / 30;

/** Small, fast, and identical everywhere — see the note at the top of the file. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A burst of `count` pieces thrown from the upper middle of a `width` x
 * `height` area, coloured from `palette` so the caller keeps ownership of the
 * palette rather than this module hard-coding one.
 *
 * They launch upward within about 60 degrees of vertical, which is what reads
 * as a burst: straight up looks like a fountain, and a full circle looks like
 * an explosion.
 */
export function createBurst(
  count: number,
  width: number,
  height: number,
  seed: number,
  palette: readonly string[],
): Particle[] {
  const first = palette[0];
  if (first === undefined) return [];

  const n = Math.floor(count);
  if (!(n > 0)) return [];

  const rand = mulberry32(seed);
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (rand() * 2 - 1) * 1.05;
    const speed = 260 + rand() * 360;
    out.push({
      x: width / 2 + (rand() * 2 - 1) * width * 0.08,
      y: height * 0.25 + (rand() * 2 - 1) * height * 0.04,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: rand() * Math.PI * 2,
      spin: (rand() * 2 - 1) * 8,
      color: palette[Math.floor(rand() * palette.length)] ?? first,
      size: 6 + rand() * 8,
    });
  }
  return out;
}

/**
 * Advance the burst by `dt` seconds and return what is still on screen.
 *
 * Drag is applied as exponential decay per second rather than a per-frame
 * multiplier, so the pieces settle to the same terminal speed at any refresh
 * rate. A piece is dropped once its whole body is below `height`; nothing ever
 * comes back up, so that is the end of it.
 */
export function stepParticles(particles: Particle[], dt: number, height: number): Particle[] {
  const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP_S) : 0;
  const damp = Math.exp(-DRAG * step);

  const out: Particle[] = [];
  for (const p of particles) {
    const vx = p.vx * damp;
    const vy = (p.vy + GRAVITY * step) * damp;
    const y = p.y + vy * step;
    if (y - p.size > height) continue;
    out.push({
      x: p.x + vx * step,
      y,
      vx,
      vy,
      rotation: p.rotation + p.spin * step,
      spin: p.spin,
      color: p.color,
      size: p.size,
    });
  }
  return out;
}

/** Nothing left to draw: the caller can stop its animation loop. */
export function isSpent(particles: readonly Particle[]): boolean {
  return particles.length === 0;
}
