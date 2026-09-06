/**
 * The geometry of a redaction box.
 *
 * Regions are stored as fractions of the image rather than pixels, because the
 * user draws them on a preview that is whatever size the screen allowed, and
 * they are applied to the original at its full resolution. A fraction survives
 * that change of scale; a pixel coordinate does not.
 */

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in 0..1 of the image, origin top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smaller than this in either direction and it was a stray click, not a drag. */
export const MIN_FRACTION = 0.005;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The rectangle between two corners, whichever way round they were dragged.
 *
 * People drag up and to the left as often as down and to the right, and a
 * pointer routinely leaves the element mid-drag, so both are normalised here
 * rather than in the component.
 */
export function rectFromDrag(start: Point, end: Point): Rect {
  const x1 = clamp01(Math.min(start.x, end.x));
  const y1 = clamp01(Math.min(start.y, end.y));
  const x2 = clamp01(Math.max(start.x, end.x));
  const y2 = clamp01(Math.max(start.y, end.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** True for a region too small to have been meant. */
export function isDegenerate(rect: Rect): boolean {
  return rect.w < MIN_FRACTION || rect.h < MIN_FRACTION;
}

/**
 * A fractional region as whole pixels of a given image.
 *
 * Rounded OUTWARD deliberately. Rounding to nearest can pull the box in by a
 * pixel, and a redaction that leaves a line of the original showing along its
 * edge is worse than no redaction at all, because it looks finished.
 */
export function toPixels(rect: Rect, width: number, height: number): PixelRect {
  const x = Math.max(0, Math.floor(rect.x * width));
  const y = Math.max(0, Math.floor(rect.y * height));
  const right = Math.min(width, Math.ceil((rect.x + rect.w) * width));
  const bottom = Math.min(height, Math.ceil((rect.y + rect.h) * height));
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
  };
}
