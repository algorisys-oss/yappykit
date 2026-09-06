import { describe, it, expect } from 'vitest';
import { roundDown, showsVisitors, MIN_VISITORS } from './visitors';

describe('roundDown', () => {
  it('keeps three significant digits and rounds down, never up', () => {
    // Rounding UP would overstate the figure, which is the one direction a
    // number like this must not move.
    expect(roundDown(183472)).toBe(183000);
    expect(roundDown(189999)).toBe(189000);
    expect(roundDown(1999)).toBe(1990);
    expect(roundDown(12345)).toBe(12300);
  });

  it('leaves a number that is already round alone', () => {
    expect(roundDown(180000)).toBe(180000);
    expect(roundDown(1000)).toBe(1000);
  });

  it('does not mangle small numbers', () => {
    expect(roundDown(7)).toBe(7);
    expect(roundDown(42)).toBe(42);
    expect(roundDown(999)).toBe(999);
    expect(roundDown(0)).toBe(0);
  });
});

describe('showsVisitors', () => {
  it('is false when the build was given nothing', () => {
    expect(showsVisitors(0)).toBe(false);
  });

  it('is false for a figure too small to be worth stating', () => {
    // "More than 40 visitors" reads worse than saying nothing at all.
    expect(showsVisitors(40)).toBe(false);
    expect(showsVisitors(MIN_VISITORS - 1)).toBe(false);
  });

  it('is true once there is a real figure', () => {
    expect(showsVisitors(MIN_VISITORS)).toBe(true);
    expect(showsVisitors(183472)).toBe(true);
  });

  it('refuses anything that is not a sane count', () => {
    // The value arrives from an external API through an environment variable.
    expect(showsVisitors(-5)).toBe(false);
    expect(showsVisitors(NaN)).toBe(false);
    expect(showsVisitors(Infinity)).toBe(false);
    expect(showsVisitors(1.5)).toBe(false);
  });
});
