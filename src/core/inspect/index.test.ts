import { describe, it, expect } from 'vitest';
import { claimedExtension } from './index';

describe('claimedExtension', () => {
  it('reads the extension off a name', () => {
    expect(claimedExtension('holiday.JPG')).toBe('jpg');
    expect(claimedExtension('archive.tar.gz')).toBe('gz');
  });

  it('is empty when the name makes no claim', () => {
    expect(claimedExtension('README')).toBe('');
    expect(claimedExtension('trailing.')).toBe('');
  });
});
