import { describe, it, expect } from 'vitest';
import { toGrayscale, grayHistogram, otsuThreshold, enhanceDocument } from './enhance';

// Build an RGBA buffer from a list of [r,g,b] pixels (alpha = 255).
function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe('toGrayscale', () => {
  it('collapses a red pixel to its luma in all channels', () => {
    const d = rgba([[255, 0, 0]]);
    toGrayscale(d);
    expect([d[0], d[1], d[2]]).toEqual([76, 76, 76]); // 0.299*255
  });
});

describe('otsuThreshold', () => {
  it('lands between two separated peaks of a bimodal histogram', () => {
    const hist = new Uint32Array(256);
    hist[40] = 500; // dark cluster
    hist[210] = 500; // light cluster
    const th = otsuThreshold(hist);
    expect(th).toBeGreaterThan(40);
    expect(th).toBeLessThan(210);
  });

  it('falls back to mid-grey on an empty histogram', () => {
    expect(otsuThreshold(new Uint32Array(256))).toBe(127);
  });
});

describe('grayHistogram', () => {
  it('counts grayscale levels', () => {
    const d = rgba([[10, 10, 10], [10, 10, 10], [200, 200, 200]]);
    const h = grayHistogram(d);
    expect(h[10]).toBe(2);
    expect(h[200]).toBe(1);
  });
});

describe('enhanceDocument', () => {
  const gradient = rgba(
    Array.from({ length: 256 }, (_, i) => [i, i, i] as [number, number, number]),
  );

  it('bw mode outputs only pure black and white', () => {
    const out = enhanceDocument(gradient, 'bw');
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i] === 0 || out[i] === 255).toBe(true);
    }
  });

  it('does not mutate the source buffer', () => {
    const src = rgba([[123, 45, 67]]);
    const before = Array.from(src);
    enhanceDocument(src, 'bw');
    expect(Array.from(src)).toEqual(before);
  });

  it('enhance mode stretches contrast to hit both 0 and 255', () => {
    const midband = rgba(
      Array.from({ length: 50 }, (_, i) => [100 + i, 100 + i, 100 + i] as [number, number, number]),
    );
    const out = enhanceDocument(midband, 'enhance');
    let min = 255;
    let max = 0;
    for (let i = 0; i < out.length; i += 4) {
      min = Math.min(min, out[i]!);
      max = Math.max(max, out[i]!);
    }
    expect(min).toBe(0);
    expect(max).toBe(255);
  });
});
