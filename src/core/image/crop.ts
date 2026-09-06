/**
 * Cropping an image to a region the user draws.
 *
 * The resizer next door centre-crops, which is the only defensible default when
 * the tool has no idea what the subject is. This is the answer for when it is
 * not in the middle: the person picks the region, and an aspect ratio can
 * constrain it so a square really is square.
 *
 * Regions are fractions of the image, not pixels, because the selection is
 * drawn on a preview at whatever size the screen allowed and applied to the
 * original at full resolution.
 *
 * The subtlety worth stating: a fraction is not a shape. On a 2000 by 1000
 * image, a selection 0.5 wide and 0.5 tall is 1000 by 500 pixels, which is 2:1,
 * not square. Every ratio here is therefore worked out in PIXELS and converted
 * back, which is the difference between a square crop and a nearly square one.
 */

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

/** Ratios expressed as width divided by height. `null` means unconstrained. */
export const ASPECTS = [
  { id: 'free', labelKey: 'aspectFree', ratio: null },
  { id: '1:1', labelKey: 'aspectSquare', ratio: 1 },
  { id: '4:3', labelKey: 'aspectFourThree', ratio: 4 / 3 },
  { id: '3:2', labelKey: 'aspectThreeTwo', ratio: 3 / 2 },
  { id: '16:9', labelKey: 'aspectSixteenNine', ratio: 16 / 9 },
  { id: '9:16', labelKey: 'aspectNineSixteen', ratio: 9 / 16 },
] as const;

export type AspectId = (typeof ASPECTS)[number]['id'];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Force a selection to a ratio, shrinking rather than growing.
 *
 * Growing to fit would push the selection past the edge of the image on any
 * region the user drew near a border, so the constrained side always comes in.
 * The centre is preserved, because that is where the user was looking.
 */
export function fitAspect(rect: Rect, ratio: number | null, width: number, height: number): Rect {
  if (ratio === null) return rect;

  const pxW = rect.w * width;
  const pxH = rect.h * height;
  const current = pxW / pxH;

  let nextW = pxW;
  let nextH = pxH;
  if (current > ratio) nextW = pxH * ratio;
  else nextH = pxW / ratio;

  const cx = (rect.x + rect.w / 2) * width;
  const cy = (rect.y + rect.h / 2) * height;

  // Centre first, then push back inside the image if that put an edge outside.
  let x = cx - nextW / 2;
  let y = cy - nextH / 2;
  x = Math.min(Math.max(0, x), Math.max(0, width - nextW));
  y = Math.min(Math.max(0, y), Math.max(0, height - nextH));

  return {
    x: clamp01(x / width),
    y: clamp01(y / height),
    w: clamp01(nextW / width),
    h: clamp01(nextH / height),
  };
}

/** A fractional region as whole pixels, never past the edge, never empty. */
export function cropToPixels(rect: Rect, width: number, height: number): PixelRect {
  const x = Math.min(width - 1, Math.max(0, Math.round(rect.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.round(rect.y * height)));
  const w = Math.max(1, Math.min(width - x, Math.round(rect.w * width)));
  const h = Math.max(1, Math.min(height - y, Math.round(rect.h * height)));
  return { x, y, w, h };
}

/** What to call the cropped copy. */
export function croppedName(name: string, extension: string): string {
  return `${name.replace(/\.[^.]+$/, '')}-cropped.${extension}`;
}
