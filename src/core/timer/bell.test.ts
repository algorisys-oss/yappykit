import { describe, it, expect } from 'vitest';
import { BELL_PARTIALS, bellDurationMs, peakGainFor, strikeAt } from './bell';

const hum = BELL_PARTIALS[0]!;
const highest = BELL_PARTIALS[BELL_PARTIALS.length - 1]!;

describe('the bell timbre', () => {
  it('is inharmonic, which is what makes it a bell rather than an organ', () => {
    // Whole-number ratios would sound like a sawtooth. A struck bell's partials
    // sit at 0.5, 1.2, 1.5 and so on, and that is the entire difference.
    const ratios = BELL_PARTIALS.map((p) => p.ratio);
    expect(ratios.some((r) => !Number.isInteger(r))).toBe(true);
  });

  it('lists partials in ascending order', () => {
    const ratios = BELL_PARTIALS.map((p) => p.ratio);
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
  });

  it('decays the high partials faster than the low ones, as a real bell does', () => {
    expect(highest.decay).toBeLessThan(hum.decay);
  });

  it('keeps the summed partial gains inside unity, so the mix cannot clip', () => {
    const total = BELL_PARTIALS.reduce((sum, p) => sum + p.gain, 0);
    expect(total).toBeLessThanOrEqual(1);
  });
});

describe('gain', () => {
  it('scales a partial by the requested volume', () => {
    expect(peakGainFor(hum, 1)).toBeCloseTo(hum.gain, 9);
    expect(peakGainFor(hum, 0.5)).toBeCloseTo(hum.gain / 2, 9);
  });

  it('never returns zero, because an exponential ramp to zero is undefined', () => {
    // exponentialRampToValueAtTime throws on a zero target, and a muted bell
    // must not take the whole scheduler down with it.
    expect(peakGainFor(hum, 0)).toBeGreaterThan(0);
  });

  it('clamps a volume that arrived out of range', () => {
    expect(peakGainFor(hum, 9)).toBeCloseTo(hum.gain, 9);
  });
});

describe('scheduling', () => {
  it('places the strike ahead on the audio clock, not the wall clock', () => {
    expect(strikeAt(12.5, 60_000)).toBeCloseTo(72.5, 9);
  });

  it('never schedules into the past, which would silently drop the strike', () => {
    expect(strikeAt(12.5, -5000)).toBeGreaterThanOrEqual(12.5);
  });

  it('rings for as long as its slowest partial', () => {
    expect(bellDurationMs()).toBeGreaterThan(1000);
  });
});
