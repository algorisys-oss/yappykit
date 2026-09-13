import { describe, it, expect } from 'vitest';
import {
  settingsFor,
  predictBytes,
  guessParams,
  buildAnimatedArgs,
  defaultRange,
  fitAnimated,
  MIN_SCALE,
  LIMITS,
  type Clip,
  type AnimatedSettings,
} from './animated';

const landscape: Clip = { width: 1280, height: 720, fps: 30, duration: 8 };
const portrait: Clip = { width: 720, height: 1280, fps: 30, duration: 8 };

describe('settingsFor', () => {
  it('caps the long side and the frame rate at the best settings', () => {
    expect(settingsFor({ quality: 1, scale: 1 }, landscape)).toEqual({ width: 640, height: 360, fps: 15 });
    expect(settingsFor({ quality: 1, scale: 1 }, portrait)).toEqual({ width: 360, height: 640, fps: 15 });
  });

  it('never scales a small clip up or raises a low frame rate', () => {
    expect(settingsFor({ quality: 1, scale: 1 }, { width: 320, height: 240, fps: 10, duration: 2 })).toEqual({
      width: 320,
      height: 240,
      fps: 10,
    });
  });

  it('reaches the smallest settings at the bottom of both ranges', () => {
    const s = settingsFor({ quality: 0, scale: MIN_SCALE }, landscape);
    expect(Math.max(s.width, s.height)).toBe(LIMITS.minLongSide);
    expect(s.fps).toBe(LIMITS.minFps);
  });

  it('keeps even dimensions and the source’s shape', () => {
    const s = settingsFor({ quality: 0.5, scale: 0.63 }, { width: 1000, height: 563, fps: 25, duration: 4 });
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
    expect(s.width / s.height).toBeCloseTo(1000 / 563, 1);
  });
});

describe('guessParams', () => {
  for (const format of ['gif', 'webp'] as const) {
    it(`gives the best settings when the budget is generous (${format})`, () => {
      expect(guessParams(500 * 1024 * 1024, landscape, format)).toEqual({ quality: 1, scale: 1 });
    });

    it(`gives the smallest settings when nothing fits (${format})`, () => {
      expect(guessParams(10, landscape, format)).toEqual({ quality: 0, scale: MIN_SCALE });
    });

    it(`predicts a size within the budget, and a bigger one for a bigger budget (${format})`, () => {
      let previous = 0;
      for (const mb of [0.5, 1, 2, 5]) {
        const budget = mb * 1024 * 1024;
        const predicted = predictBytes(settingsFor(guessParams(budget, landscape, format), landscape), landscape.duration, format);
        expect(predicted).toBeLessThanOrEqual(budget * 1.001);
        expect(predicted).toBeGreaterThanOrEqual(previous);
        previous = predicted;
      }
    });
  }
});

describe('fitAnimated', () => {
  /**
   * An encoder whose files are the model times a content factor, with the size
   * exponents also off by `skew`, since the fitted exponents are averages over
   * three clips and no real clip follows them exactly.
   */
  const fake = (format: 'gif' | 'webp', factor: number, skew = 1) => {
    const calls: AnimatedSettings[] = [];
    return {
      calls,
      encode: async (s: AnimatedSettings) => {
        calls.push(s);
        const bytes = factor * Math.pow(predictBytes(s, landscape.duration, format), skew);
        return new Uint8Array(Math.round(bytes));
      },
    };
  };
  const budget = 512 * 1024;

  for (const format of ['gif', 'webp'] as const) {
    for (const [factor, skew] of [[1, 1], [2, 1], [5, 1], [4, 1.03], [3, 0.97]] as const) {
      it(`fits and uses most of the budget, content ${factor}x, skew ${skew} (${format})`, async () => {
        const f = fake(format, factor, skew);
        const r = await fitAnimated({ clip: landscape, format, budgetBytes: budget, encode: f.encode });
        expect(r.withinBudget).toBe(true);
        expect(r.encodes).toBeLessThanOrEqual(3);
        const atBest = r.settings.width === 640 && r.settings.fps === 15;
        expect(atBest || r.output.byteLength > budget * 0.7).toBe(true);
      });
    }
  }

  it('corrects when the model says the best settings fit and they do not', async () => {
    // A small clip whose best settings the model puts well under budget.
    const clip: Clip = { width: 360, height: 640, fps: 30, duration: 8 };
    const bestPredicted = predictBytes(settingsFor({ quality: 1, scale: 1 }, clip), 8, 'gif');
    const budgetBytes = bestPredicted * 1.5;
    const calls: AnimatedSettings[] = [];
    const r = await fitAnimated({
      clip,
      format: 'gif',
      budgetBytes,
      encode: async (s) => {
        calls.push(s);
        return new Uint8Array(Math.round(4 * predictBytes(s, 8, 'gif')));
      },
    });
    expect(calls[0]).toEqual(settingsFor({ quality: 1, scale: 1 }, clip));
    expect(r.withinBudget).toBe(true);
    expect(r.encodes).toBe(2);
  });

  it('tries once more for a bigger file when the first one came out far under', async () => {
    // Small enough that even at 0.4x the best settings would not fit.
    const small = 200 * 1024;
    const f = fake('gif', 0.4);
    const r = await fitAnimated({ clip: landscape, format: 'gif', budgetBytes: small, encode: f.encode });
    expect(f.calls.length).toBe(2);
    expect(r.withinBudget).toBe(true);
    expect(r.output.byteLength).toBeGreaterThan(small * 0.7);
  });

  it('stops at the best settings when they already fit', async () => {
    const f = fake('webp', 1);
    const r = await fitAnimated({ clip: landscape, format: 'webp', budgetBytes: 100 * 1024 * 1024, encode: f.encode });
    expect(f.calls).toEqual([{ width: 640, height: 360, fps: 15 }]);
    expect(r.withinBudget).toBe(true);
  });

  it('returns the smallest file, marked as not fitting, when nothing fits', async () => {
    const f = fake('gif', 50);
    const r = await fitAnimated({ clip: landscape, format: 'gif', budgetBytes: 10 * 1024, encode: f.encode });
    expect(r.withinBudget).toBe(false);
    expect(r.output.byteLength).toBe(Math.min(...(await Promise.all(f.calls.map(async (s) => (await fake('gif', 50).encode(s)).byteLength)))));
    expect(r.settings).toEqual(settingsFor({ quality: 0, scale: MIN_SCALE }, landscape));
  });
});

describe('buildAnimatedArgs', () => {
  const settings = { width: 480, height: 270, fps: 12 };

  it('seeks the clip, builds a palette from it, and loops forever for GIF', () => {
    expect(buildAnimatedArgs({ input: 'in.mp4', output: 'out.gif', format: 'gif', start: 3.5, duration: 6, settings })).toEqual([
      '-ss', '3.5', '-t', '6', '-i', 'in.mp4',
      '-filter_complex',
      'fps=12,scale=480:270:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop', '0', '-an', 'out.gif',
    ]);
  });

  it('writes animated WebP with the animation encoder', () => {
    expect(buildAnimatedArgs({ input: 'in.mp4', output: 'out.webp', format: 'webp', start: 0, duration: 4, settings })).toEqual([
      '-ss', '0', '-t', '4', '-i', 'in.mp4',
      '-vf', 'fps=12,scale=480:270:flags=lanczos',
      '-c:v', 'libwebp_anim', '-quality', '75', '-loop', '0', '-an', 'out.webp',
    ]);
  });
});

describe('defaultRange', () => {
  it('takes a short clip whole and the first ten seconds of a long one', () => {
    expect(defaultRange(6.4)).toEqual({ start: 0, end: 6.4 });
    expect(defaultRange(95)).toEqual({ start: 0, end: 10 });
  });
});
