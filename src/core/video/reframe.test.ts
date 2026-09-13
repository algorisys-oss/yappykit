import { describe, it, expect } from 'vitest';
import { TARGETS, cropWindow, panAxis, fitCanvas, buildReframeArgs } from './reframe';

const HD = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };
const even = (...ns: number[]) => ns.forEach((n) => expect(n % 2, String(n)).toBe(0));

describe('cropWindow', () => {
  it('takes the full height of a landscape video for a vertical crop', () => {
    const w = cropWindow(HD, TARGETS.vertical, 0.5);
    expect(w.h).toBe(1080);
    expect(w.w).toBe(606); // 1080 * 9/16 = 607.5, rounded down to even so it stays inside
    expect(w.y).toBe(0);
    even(w.x, w.y, w.w, w.h);
  });

  it('keeps the ratio to within 2 px on the rounded side, worked out in pixels', () => {
    for (const [frame, ratio] of [
      [HD, TARGETS.vertical],
      [HD, TARGETS.square],
      [HD, TARGETS.portrait],
      [TALL, TARGETS.landscape],
      [{ width: 1279, height: 721 }, TARGETS.square],
    ] as const) {
      const w = cropWindow(frame, ratio, 0.3);
      // One side is exact and the other is rounded down to even, so it can be up
      // to 2 px short of the true value for the exact side. That, not a fixed
      // tolerance on w/h, is the guarantee: a 2 px error on a 16:9 height moves
      // the ratio three times as much as the same error on a 9:16 one.
      const off = Math.min(Math.abs(w.w - w.h * ratio), Math.abs(w.h - w.w / ratio));
      expect(off).toBeLessThanOrEqual(2);
      expect(w.x + w.w).toBeLessThanOrEqual(frame.width);
      expect(w.y + w.h).toBeLessThanOrEqual(frame.height);
      even(w.x, w.y, w.w, w.h);
    }
  });

  it('moves the window across the free travel with the pan', () => {
    expect(cropWindow(HD, TARGETS.square, 0).x).toBe(0);
    expect(cropWindow(HD, TARGETS.square, 1).x).toBe(1920 - 1080);
    expect(cropWindow(HD, TARGETS.square, 0.5).x).toBe(420);
  });

  it('pans vertically when the source is taller than the target', () => {
    const top = cropWindow(TALL, TARGETS.landscape, 0);
    const bottom = cropWindow(TALL, TARGETS.landscape, 1);
    expect(top.x).toBe(0);
    expect(top.w).toBe(1080);
    expect(top.y).toBe(0);
    expect(bottom.y + bottom.h).toBeLessThanOrEqual(1920);
    expect(bottom.y).toBeGreaterThan(1920 - bottom.h - 2);
  });

  it('clamps a pan outside 0..1 rather than cropping off the edge', () => {
    const w = cropWindow(HD, TARGETS.vertical, 7);
    expect(w.x + w.w).toBeLessThanOrEqual(1920);
    expect(cropWindow(HD, TARGETS.vertical, -3).x).toBe(0);
  });
});

describe('panAxis', () => {
  it('says which way the window can move, or that it cannot', () => {
    expect(panAxis(HD, TARGETS.vertical)).toBe('x');
    expect(panAxis(TALL, TARGETS.landscape)).toBe('y');
    expect(panAxis(HD, TARGETS.landscape)).toBeNull();
  });
});

describe('fitCanvas', () => {
  it('keeps the source’s short side, so the picture is never scaled up to fit', () => {
    expect(fitCanvas(HD, TARGETS.vertical)).toEqual({ width: 1080, height: 1920 });
    expect(fitCanvas(HD, TARGETS.square)).toEqual({ width: 1080, height: 1080 });
    expect(fitCanvas(HD, TARGETS.portrait)).toEqual({ width: 1080, height: 1350 });
    expect(fitCanvas(TALL, TARGETS.landscape)).toEqual({ width: 1920, height: 1080 });
  });

  it('is always even', () => {
    const c = fitCanvas({ width: 853, height: 481 }, TARGETS.vertical);
    even(c.width, c.height);
  });
});

describe('buildReframeArgs', () => {
  const base = { input: 'in.mp4', output: 'out.mp4', frame: HD, ratio: TARGETS.vertical, pan: 0.5 };

  it('crops with a single filter, square pixels, and the audio re-encoded', () => {
    const args = buildReframeArgs({ ...base, mode: 'fill', hasAudio: true });
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=606:1080:656:0,setsar=1');
    expect(args).not.toContain('-filter_complex');
    expect(args.join(' ')).toContain('-map 0:v:0 -map 0:a:0');
    expect(args.join(' ')).toContain('-c:a aac');
  });

  it('fits the whole picture over a blurred copy of itself', () => {
    const args = buildReframeArgs({ ...base, mode: 'fit', hasAudio: false });
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain('split=2[bg][fg]');
    expect(graph).toContain('[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=');
    expect(graph).toContain('[fg]scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(graph).toContain('overlay=(W-w)/2:(H-h)/2');
    expect(graph.endsWith('[outv]')).toBe(true);
    expect(args).toContain('-an');
    expect(args.join(' ')).not.toContain('0:a');
  });

  it('keeps the foreground even after scaling, which H.264 requires', () => {
    const args = buildReframeArgs({ ...base, mode: 'fit', hasAudio: false });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  });
});
