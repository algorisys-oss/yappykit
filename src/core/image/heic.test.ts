import { describe, it, expect } from 'vitest';
import { isHeic } from './heic';

// An ISO-BMFF header: [size(4)][ 'ftyp' ][ brand(4) ]...
function ftyp(brand: string): Uint8Array {
  const b = new Uint8Array(16);
  b.set([0, 0, 0, 0x18], 0); // box size (arbitrary)
  b.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4);
  b.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return b;
}

describe('isHeic', () => {
  it('recognises common HEIC/HEIF brands', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'heif', 'hevc']) {
      expect(isHeic(ftyp(brand)), brand).toBe(true);
    }
  });

  it('rejects AVIF (browser-native, same container family)', () => {
    expect(isHeic(ftyp('avif'))).toBe(false);
  });

  it('rejects a JPEG header', () => {
    expect(isHeic(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });

  it('rejects a non-ftyp box', () => {
    const b = ftyp('heic');
    b.set([...'moov'].map((c) => c.charCodeAt(0)), 4); // swap 'ftyp' → 'moov'
    expect(isHeic(b)).toBe(false);
  });

  it('rejects too-short input', () => {
    expect(isHeic(Uint8Array.from([0, 0, 0]))).toBe(false);
  });
});
