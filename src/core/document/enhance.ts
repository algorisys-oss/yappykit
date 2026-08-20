/**
 * Document enhancement — turn a phone photo of a page into a clean "scan".
 *
 * Pure functions over RGBA pixel buffers (Uint8ClampedArray) so they unit-test
 * without a DOM and can move into a worker unchanged. Three modes: grayscale,
 * contrast-stretched grayscale, and Otsu black-and-white.
 */

export type EnhanceMode = 'grayscale' | 'enhance' | 'bw';

/** In-place RGBA → grayscale (luma in all three channels). */
export function toGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const y = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) | 0;
    data[i] = y;
    data[i + 1] = y;
    data[i + 2] = y;
  }
}

/** 256-bin histogram of the (assumed grayscale) red channel. */
export function grayHistogram(data: Uint8ClampedArray): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i]!;
    hist[g] = hist[g]! + 1;
  }
  return hist;
}

/** Otsu's method: the threshold that maximises between-class variance. */
export function otsuThreshold(hist: ArrayLike<number>): number {
  let total = 0;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    total += hist[t]!;
    sumAll += t * hist[t]!;
  }
  if (total === 0) return 127;

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let runStart = 127;
  let runEnd = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      runStart = t;
      runEnd = t;
    } else if (between === maxVar) {
      // Flat plateau across the valley between two peaks — keep extending so we
      // return its midpoint (a more robust threshold than either edge).
      runEnd = t;
    }
  }
  return Math.round((runStart + runEnd) / 2);
}

/** In-place linear contrast stretch of a grayscale buffer to full 0–255. */
export function contrastStretch(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const v = (((data[i]! - min) / range) * 255) | 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

/** Enhance a COPY of the source RGBA buffer by the chosen mode. */
export function enhanceDocument(src: Uint8ClampedArray, mode: EnhanceMode): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  toGrayscale(out);
  if (mode === 'grayscale') return out;
  if (mode === 'enhance') {
    contrastStretch(out);
    return out;
  }
  // bw
  const th = otsuThreshold(grayHistogram(out));
  for (let i = 0; i < out.length; i += 4) {
    const v = out[i]! > th ? 255 : 0; // Otsu convention: class 0 = [0..t]
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
  }
  return out;
}
