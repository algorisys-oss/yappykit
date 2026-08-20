/**
 * Crop geometry for the passport tool. Pure math shared by the live preview and
 * the final export, so what you see is exactly what you get.
 *
 * The user frames with a zoom (>=1) and a normalized pan offset (-1..1 on each
 * axis). Given the source dimensions and the target aspect ratio, we compute the
 * source sub-rectangle to draw into the output.
 */

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface CropInput {
  sourceWidth: number;
  sourceHeight: number;
  targetAspect: number; // width / height
  zoom: number; // >= 1
  offsetX: number; // -1..1
  offsetY: number; // -1..1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeCrop(input: CropInput): CropRect {
  const { sourceWidth: sw, sourceHeight: sh, targetAspect } = input;
  const zoom = Math.max(1, input.zoom);

  // Largest rect of the target aspect that fits the source ("cover" base).
  let baseW: number;
  let baseH: number;
  if (sw / sh > targetAspect) {
    baseH = sh;
    baseW = sh * targetAspect;
  } else {
    baseW = sw;
    baseH = sw / targetAspect;
  }

  const cropW = baseW / zoom;
  const cropH = baseH / zoom;
  const maxX = sw - cropW;
  const maxY = sh - cropH;

  const ox = clamp(input.offsetX, -1, 1);
  const oy = clamp(input.offsetY, -1, 1);
  const cropX = clamp(maxX / 2 + (ox * maxX) / 2, 0, maxX);
  const cropY = clamp(maxY / 2 + (oy * maxY) / 2, 0, maxY);

  return { sx: cropX, sy: cropY, sw: cropW, sh: cropH };
}
