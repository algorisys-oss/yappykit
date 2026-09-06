import { describe, it, expect } from 'vitest';
// @ts-expect-error - a build script, deliberately plain JS with no types
import { readVisits } from '../../scripts/fetch-visitors.mjs';

/**
 * The number crosses a trust boundary: it comes from an HTTP response and ends
 * up baked into every page. Anything that is not a plain count is refused, so a
 * changed API shape produces no figure rather than "NaN visitors".
 */
describe('readVisits', () => {
  const wrap = (groups: unknown) => ({
    data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: groups }] } },
  });

  it('reads the count out of a well-formed answer', () => {
    expect(readVisits(wrap([{ sum: { visits: 183472 } }]))).toBe(183472);
  });

  it('accepts a genuine zero', () => {
    expect(readVisits(wrap([{ sum: { visits: 0 } }]))).toBe(0);
  });

  it('refuses an answer whose shape changed', () => {
    expect(readVisits(wrap([]))).toBeNull();
    expect(readVisits(wrap([{}]))).toBeNull();
    expect(readVisits(wrap(undefined))).toBeNull();
    expect(readVisits({ data: { viewer: { accounts: [] } } })).toBeNull();
    expect(readVisits({})).toBeNull();
    expect(readVisits(null)).toBeNull();
  });

  it('refuses a value that is not a whole count', () => {
    expect(readVisits(wrap([{ sum: { visits: '183472' } }]))).toBeNull();
    expect(readVisits(wrap([{ sum: { visits: -1 } }]))).toBeNull();
    expect(readVisits(wrap([{ sum: { visits: 1.5 } }]))).toBeNull();
  });
});
