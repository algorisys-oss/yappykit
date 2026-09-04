import { describe, it, expect } from 'vitest';
import { inkFor, outputFor, watermarkedName } from './watermark-paint';

/**
 * The drawing itself needs a real canvas and is proven in tests/e2e. What is
 * decided rather than drawn is decided here, and tested here.
 */

describe('inkFor', () => {
  it('puts dark ink on paper and light ink on a night photograph', () => {
    expect(inkFor(250)).toBe('dark');
    expect(inkFor(10)).toBe('light');
  });

  it('treats mid grey as dark enough to need light ink', () => {
    expect(inkFor(128)).toBe('light');
  });
});

describe('outputFor', () => {
  it('leaves JPEG and PNG in their own format', () => {
    expect(outputFor('image/jpeg')).toEqual({ type: 'image/jpeg', converted: false });
    expect(outputFor('image/png')).toEqual({ type: 'image/png', converted: false });
  });

  it('converts what a canvas cannot write back, and says so', () => {
    for (const type of ['image/heic', 'image/webp', 'image/avif', '']) {
      expect(outputFor(type), type).toEqual({ type: 'image/jpeg', converted: true });
    }
  });
});

describe('watermarkedName', () => {
  it('marks the name and takes the extension from the real output format', () => {
    expect(watermarkedName('IMG_0042.HEIC', 'image/jpeg')).toBe('IMG_0042-watermarked.jpg');
    expect(watermarkedName('logo.png', 'image/png')).toBe('logo-watermarked.png');
  });

  it('copes with a name that has no extension', () => {
    expect(watermarkedName('scan', 'image/jpeg')).toBe('scan-watermarked.jpg');
  });

  it('does not mistake a dotfile for an extension', () => {
    expect(watermarkedName('.hidden', 'image/jpeg')).toBe('.hidden-watermarked.jpg');
  });
});
