import { describe, it, expect } from 'vitest';
import { commonWidth, stitchedName } from './compose';

describe('commonWidth', () => {
  it('takes the width most of the screenshots share', () => {
    expect(commonWidth([1170, 1170, 828, 1170])).toBe(1170);
  });

  it('breaks a tie towards the wider one, which resamples the least', () => {
    expect(commonWidth([828, 1170])).toBe(1170);
  });

  it('handles a single screenshot', () => {
    expect(commonWidth([1284])).toBe(1284);
  });
});

describe('stitchedName', () => {
  it('names the result after the first screenshot', () => {
    expect(stitchedName(['Screenshot_20260827_120101.png'], 'png')).toBe(
      'Screenshot_20260827_120101-stitched.png',
    );
  });

  it('uses the chosen extension rather than the original one', () => {
    expect(stitchedName(['shot.png'], 'pdf')).toBe('shot-stitched.pdf');
  });

  it('has a name to fall back on when the list is empty', () => {
    expect(stitchedName([], 'png')).toBe('stitched.png');
  });
});
