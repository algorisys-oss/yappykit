/**
 * Colours out of an image: one you point at, and the handful the image is
 * mostly made of.
 *
 * Two decisions here are worth stating, because the obvious version of each is
 * wrong in a way that only shows up on real photographs.
 *
 * The first is what a swatch actually is. Median cut divides the colours into
 * boxes and the textbook then averages each box, which is how a palette ends up
 * full of muddy browns and greys that appear nowhere in the picture: the mean
 * of a red flower and a green leaf is mud. Here each swatch is the real pixel
 * nearest that mean, so every colour offered is a colour the image contains and
 * can be pointed at.
 *
 * The second is ordering. Sorting a palette by hue makes a prettier strip and
 * lies about the image, because it buries the colour that covers half the frame
 * between two that cover a percent each. These stay in order of how much of the
 * image they account for, and each says what that share is.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Swatch {
  rgb: Rgb;
  hex: string;
  /** Fraction of the sampled pixels this swatch stands for, 0 to 1. */
  share: number;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (n: number) => clamp(n).toString(16).padStart(2, '0');

export function toHex({ r, g, b }: Rgb): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function toRgbCss({ r, g, b }: Rgb): string {
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

/** HSL as CSS writes it, rounded, because nobody pastes 14 decimal places. */
export function toHslCss({ r, g, b }: Rgb): string {
  const rn = clamp(r) / 255;
  const gn = clamp(g) / 255;
  const bn = clamp(b) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/** WCAG relative luminance: sRGB linearised, then weighted for the eye. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const n = clamp(v) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast, 1 to 21. Order of the arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const BLACK: Rgb = { r: 0, g: 0, b: 0 };
export const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Which of black or white to write on this colour. Whichever contrasts more. */
export function readableTextOn(rgb: Rgb): Rgb {
  return contrastRatio(rgb, BLACK) >= contrastRatio(rgb, WHITE) ? BLACK : WHITE;
}

/**
 * Take an evenly spread sample rather than every pixel.
 *
 * A 12 megapixel photo has 48 MB of RGBA and no more colour information than a
 * few tens of thousands of pixels spread across it. The stride is computed from
 * the pixel count so the sample is spread over the whole frame; taking the
 * first N pixels instead would build a palette out of the top edge of the image.
 *
 * Pixels that are mostly transparent are skipped: their colour is whatever
 * happens to sit under an alpha of zero, which is usually black and always a
 * lie about what the image looks like.
 */
export function samplePixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxSamples = 20000,
): Rgb[] {
  const total = width * height;
  if (total <= 0) return [];
  const stride = Math.max(1, Math.floor(total / Math.max(1, maxSamples)));
  const out: Rgb[] = [];
  for (let i = 0; i < total; i += stride) {
    const at = i * 4;
    if (rgba[at + 3]! < 128) continue;
    out.push({ r: rgba[at]!, g: rgba[at + 1]!, b: rgba[at + 2]! });
  }
  return out;
}

interface Box {
  pixels: Rgb[];
}

const channelOf = (p: Rgb, axis: 0 | 1 | 2) => (axis === 0 ? p.r : axis === 1 ? p.g : p.b);

/** The axis this box is most spread along, and by how much. */
function widestAxis(pixels: readonly Rgb[]): { axis: 0 | 1 | 2; range: number } {
  let best: { axis: 0 | 1 | 2; range: number } = { axis: 0, range: -1 };
  for (const axis of [0, 1, 2] as const) {
    let lo = 255;
    let hi = 0;
    for (const p of pixels) {
      const v = channelOf(p, axis);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo;
    if (range > best.range) best = { axis, range };
  }
  return best;
}

/** The real pixel closest to the box's mean, so no invented colours. */
function representative(pixels: readonly Rgb[]): Rgb {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const p of pixels) {
    sr += p.r;
    sg += p.g;
    sb += p.b;
  }
  const n = pixels.length;
  const mean = { r: sr / n, g: sg / n, b: sb / n };
  let best = pixels[0]!;
  let bestD = Infinity;
  for (const p of pixels) {
    const d = (p.r - mean.r) ** 2 + (p.g - mean.g) ** 2 + (p.b - mean.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The pixel in this box least like anything already picked. */
function mostDistinct(pixels: readonly Rgb[], chosen: readonly Rgb[]): Rgb {
  let best = pixels[0]!;
  let bestD = -1;
  for (const p of pixels) {
    let nearest = Infinity;
    for (const c of chosen) {
      const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
      if (d < nearest) nearest = d;
    }
    if (nearest > bestD) {
      bestD = nearest;
      best = p;
    }
  }
  return best;
}

/**
 * Median cut: split the most spread-out box along its widest axis until there
 * are enough of them.
 *
 * A box of one single colour is never split, so an image with three colours in
 * it yields three swatches rather than five, two of which would be duplicates.
 */
export function extractPalette(pixels: readonly Rgb[], count: number): Swatch[] {
  if (!pixels.length || count < 1) return [];
  let boxes: Box[] = [{ pixels: [...pixels] }];

  while (boxes.length < count) {
    let target = -1;
    let targetRange = 0;
    for (const [i, box] of boxes.entries()) {
      if (box.pixels.length < 2) continue;
      const { range } = widestAxis(box.pixels);
      if (range > targetRange) {
        targetRange = range;
        target = i;
      }
    }
    // Every box is a single colour: splitting further would only duplicate.
    if (target < 0 || targetRange === 0) break;

    const box = boxes[target]!;
    const { axis } = widestAxis(box.pixels);
    const sorted = [...box.pixels].sort((a, b) => channelOf(a, axis) - channelOf(b, axis));
    const mid = sorted.length >> 1;
    boxes = [
      ...boxes.slice(0, target),
      { pixels: sorted.slice(0, mid) },
      { pixels: sorted.slice(mid) },
      ...boxes.slice(target + 1),
    ];
  }

  const chosen: Rgb[] = [];
  const taken = (c: Rgb) => chosen.some((x) => x.r === c.r && x.g === c.g && x.b === c.b);
  for (const box of boxes) {
    if (!box.pixels.length) continue;
    let rgb = representative(box.pixels);
    // Two boxes often land on the same colour, because a split can fall inside
    // a run of one colour and leave both halves dominated by it. Dropping the
    // duplicate would lose a swatch and, with it, whatever minority colour that
    // box also held: a picture that is mostly black with a little white and
    // some red would report black and red and forget the white entirely. So
    // when the obvious colour is taken, take the least similar one in the box.
    if (taken(rgb)) rgb = mostDistinct(box.pixels, chosen);
    if (!taken(rgb)) chosen.push(rgb);
  }
  if (!chosen.length) return [];

  // Shares come from assigning every pixel to its nearest swatch, not from the
  // size of the box it came from. Median cut splits at the median, so its boxes
  // hold roughly equal numbers of pixels whatever the picture looks like, and
  // reporting that as a share would say every colour covers the same amount of
  // an image where one colour plainly dominates.
  const counts = new Array<number>(chosen.length).fill(0);
  for (const p of pixels) {
    let best = 0;
    let bestD = Infinity;
    for (const [i, c] of chosen.entries()) {
      const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    counts[best] = counts[best]! + 1;
  }

  return chosen
    .map((rgb, i) => ({ rgb, hex: toHex(rgb), share: counts[i]! / pixels.length }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share);
}
