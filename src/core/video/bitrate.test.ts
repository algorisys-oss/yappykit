import { describe, it, expect } from 'vitest';
import { planBitrate, correctBitrate, MIN_VIDEO_KBPS } from './bitrate';

describe('planBitrate', () => {
  it('computes a feasible video bitrate from budget and duration', () => {
    // 16 MB, 60 s, 128 kbps audio.
    const plan = planBitrate({ targetBytes: 16 * 1024 * 1024, durationSec: 60 });
    expect(plan.feasible).toBe(true);
    expect(plan.audioKbps).toBe(128);
    // ~2000 kbps ballpark; assert a sane range rather than an exact figure.
    expect(plan.videoKbps).toBeGreaterThan(1500);
    expect(plan.videoKbps).toBeLessThan(2200);
  });

  it('reserves the audio budget — more audio leaves less for video', () => {
    const base = planBitrate({ targetBytes: 16 * 1024 * 1024, durationSec: 60, audioKbps: 64 });
    const loud = planBitrate({ targetBytes: 16 * 1024 * 1024, durationSec: 60, audioKbps: 256 });
    expect(loud.videoKbps).toBeLessThan(base.videoKbps);
  });

  it('flags infeasible when the budget is too small, clamping to the floor', () => {
    // 1 MB for a 10-minute video → impossible; clamp up and warn.
    const plan = planBitrate({ targetBytes: 1 * 1024 * 1024, durationSec: 600 });
    expect(plan.feasible).toBe(false);
    expect(plan.videoKbps).toBe(MIN_VIDEO_KBPS);
  });

  it('rejects non-positive duration or budget', () => {
    expect(() => planBitrate({ targetBytes: 1000, durationSec: 0 })).toThrow(RangeError);
    expect(() => planBitrate({ targetBytes: 0, durationSec: 10 })).toThrow(RangeError);
  });
});

describe('correctBitrate', () => {
  it('lowers the bitrate when the first pass overshot the budget', () => {
    // Asked for 2000 kbps, got 20 MB but wanted 16 MB → scale down.
    const next = correctBitrate(2000, 20 * 1024 * 1024, 16 * 1024 * 1024);
    expect(next).toBeLessThan(2000);
    expect(next).toBeGreaterThan(MIN_VIDEO_KBPS);
  });

  it('never returns below the floor', () => {
    expect(correctBitrate(60, 100 * 1024 * 1024, 1 * 1024 * 1024)).toBe(MIN_VIDEO_KBPS);
  });
});
