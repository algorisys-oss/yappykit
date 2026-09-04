/**
 * Where every copy of a watermark goes. Pure geometry: no canvas, no DOM.
 *
 * The two modes are two different jobs, not two settings. "Sign it" puts one
 * mark in a corner and is about attribution. "Protect it" tiles the frame and
 * is about a scan of an ID or a proof photo that must still carry the mark
 * after somebody crops it, which is why that mode gets to overrule the size you
 * asked for. See CROP_GUARD.
 *
 * Everything is measured against the image rather than in pixels, so one spec
 * applies to a batch of mixed sizes and the live preview can share this code
 * with the export at a different resolution. ./watermark-paint does the
 * drawing; this module makes the decisions.
 */

export type Purpose = 'sign' | 'protect';

export type Anchor =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export interface Size {
  width: number;
  height: number;
}

export interface WatermarkSpec {
  purpose: Purpose;
  /** Corner or edge the single mark sits in. Ignored when tiling. */
  anchor: Anchor;
  /** Mark height as a fraction of the image's SHORTER side. */
  scale: number;
  /** Ceiling on mark width as a fraction of image width, so long text fits. */
  maxWidth: number;
  /** Margin as a fraction of the shorter side. Ignored when tiling. */
  inset: number;
  opacity: number;
  angleDeg: number;
  /** Space between tiles, in multiples of the tile's own size. */
  tileGap: number;
}

/** One copy of the mark: `x`/`y` is its CENTRE, which is also what it spins about. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  angleDeg: number;
}

/**
 * The crop a tiled watermark is promised to survive.
 *
 * Keep at least this fraction of the width AND of the height and a mark centre
 * is still inside what is left. It holds because the tile lattice is sized so
 * its cell diagonal never exceeds this fraction of the shorter side: any point
 * is then within half a cell diagonal of a mark, and a crop that big contains a
 * disc of that radius around its own centre.
 *
 * This is the number the interface should quote, because it is the only
 * concrete thing a watermark can promise. It is not protection against someone
 * painting the mark out.
 */
export const CROP_GUARD = 0.3;

/** Slack against the guard, so the promise holds with room rather than exactly. */
const GUARD_MARGIN = 0.95;

/**
 * How much wider than tall one tile of the lattice may be.
 *
 * Spacing rows by the mark's own height stacks a wide, short mark — which is
 * what a line of text is — into a solid block. Rows get at least a third of the
 * mark's width between them instead.
 */
const CELL_MAX_ASPECT = 3;

export function defaultsFor(purpose: Purpose): WatermarkSpec {
  return purpose === 'sign'
    ? {
        purpose,
        anchor: 'bottom-right',
        scale: 0.06,
        maxWidth: 0.4,
        inset: 0.03,
        opacity: 0.75,
        angleDeg: 0,
        tileGap: 0.6,
      }
    : {
        purpose,
        anchor: 'center',
        scale: 0.05,
        maxWidth: 0.5,
        inset: 0,
        opacity: 0.28,
        angleDeg: -30,
        tileGap: 0.6,
      };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function placements(image: Size, mark: Size, spec: WatermarkSpec): Placement[] {
  if (image.width <= 0 || image.height <= 0) return [];
  if (mark.width <= 0 || mark.height <= 0) return [];

  return spec.purpose === 'sign' ? [signOne(image, mark, spec)] : tile(image, mark, spec);
}

function signOne(image: Size, mark: Size, spec: WatermarkSpec): Placement {
  const shorter = Math.min(image.width, image.height);
  const aspect = mark.width / mark.height;

  let h = spec.scale * shorter;
  let w = aspect * h;
  const cap = spec.maxWidth * image.width;
  if (w > cap) {
    w = cap;
    h = w / aspect;
  }

  const inset = spec.inset * shorter;
  // A mark wider than the insets allow still has to sit inside the picture, so
  // the clamp to the frame comes after the clamp to the margin.
  const x = clamp(anchored(spec.anchor, 'x', image.width, w, inset), w / 2, image.width - w / 2);
  const y = clamp(anchored(spec.anchor, 'y', image.height, h, inset), h / 2, image.height - h / 2);

  return { x, y, w, h, angleDeg: spec.angleDeg };
}

function anchored(anchor: Anchor, axis: 'x' | 'y', extent: number, size: number, inset: number) {
  const near = inset + size / 2;
  const far = extent - inset - size / 2;
  const mid = extent / 2;
  if (axis === 'x') {
    if (anchor.endsWith('left')) return near;
    if (anchor.endsWith('right')) return far;
    return mid;
  }
  if (anchor.startsWith('top')) return near;
  if (anchor.startsWith('bottom')) return far;
  return mid;
}

function tile(image: Size, mark: Size, spec: WatermarkSpec): Placement[] {
  const shorter = Math.min(image.width, image.height);
  const aspect = mark.width / mark.height;

  // Cell dimensions expressed in multiples of the mark's own height, so the
  // size that satisfies the crop guard can be solved for directly.
  const cellH = Math.max(1, aspect / CELL_MAX_ASPECT);
  const cellDiag = Math.hypot(aspect, cellH) * (1 + spec.tileGap);
  const hCeiling = (GUARD_MARGIN * CROP_GUARD * shorter) / cellDiag;

  const h = Math.min(spec.scale * shorter, hCeiling);
  const w = aspect * h;
  if (h <= 0) return [];

  const pitchX = w * (1 + spec.tileGap);
  const pitchY = cellH * h * (1 + spec.tileGap);

  const rad = (spec.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = image.width / 2;
  const cy = image.height / 2;

  // The lattice is laid out in the mark's own rotated frame and mapped back, so
  // the grid stays square to the marks however far they are turned.
  let maxU = 0;
  let maxV = 0;
  for (const [dx, dy] of [
    [-cx, -cy],
    [cx, -cy],
    [cx, cy],
    [-cx, cy],
  ] as const) {
    maxU = Math.max(maxU, Math.abs(dx * cos + dy * sin));
    maxV = Math.max(maxV, Math.abs(-dx * sin + dy * cos));
  }

  const cols = Math.ceil(maxU / pitchX) + 1;
  const rows = Math.ceil(maxV / pitchY) + 1;
  const reach = Math.hypot(w, h) / 2;

  const out: Placement[] = [];
  for (let j = -rows; j <= rows; j++) {
    // Alternate rows are offset half a pitch: an aligned grid leaves clean
    // vertical corridors between columns for a narrow crop to fall through.
    const u0 = (j & 1) === 0 ? 0 : pitchX / 2;
    for (let i = -cols; i <= cols; i++) {
      const u = i * pitchX + u0;
      const v = j * pitchY;
      const x = u * cos - v * sin + cx;
      const y = u * sin + v * cos + cy;
      if (x < -reach || x > image.width + reach) continue;
      if (y < -reach || y > image.height + reach) continue;
      out.push({ x, y, w, h, angleDeg: spec.angleDeg });
    }
  }
  return out;
}
