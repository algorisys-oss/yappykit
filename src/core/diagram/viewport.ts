/**
 * Pan and zoom for the preview, as plain arithmetic on a translate + scale.
 *
 * The point under the cursor (or between two fingers) stays where it is while
 * zooming, which is what makes zooming into one corner of a large flowchart
 * usable instead of a hunt for where it went.
 */

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

/** Zoom by `factor` about the point (px, py) in the preview box's coordinates. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const scale = clamp(v.scale * factor);
  const k = scale / v.scale;
  return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/**
 * The diagram centred in the box, as large as fits but never enlarged past its
 * drawn size, where a small diagram's text starts to look blown up.
 */
export function fitView(w: number, h: number, boxW: number, boxH: number, pad = 16): View {
  if (!(w > 0) || !(h > 0) || !(boxW > 0) || !(boxH > 0)) return { scale: 1, x: 0, y: 0 };
  const scale = clamp(Math.min((boxW - 2 * pad) / w, (boxH - 2 * pad) / h, 1));
  return { scale, x: (boxW - w * scale) / 2, y: (boxH - h * scale) / 2 };
}
