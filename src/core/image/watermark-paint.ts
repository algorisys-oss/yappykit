/**
 * The canvas half of the watermarker: ./watermark decides, this draws.
 *
 * Two things here are not just drawing. The mark's size is measured from its
 * own ink rather than its font size, so a placement of height h really is h
 * pixels of visible text and the live preview matches the export. And the
 * colour is chosen per placement from what is underneath it, because a light
 * mark disappears on paper and a dark one disappears on a photograph, and a
 * scanned ID is both in the same frame.
 */
import type { DecodedImage } from './canvas-codec';
import { placements, type Placement, type Size, type WatermarkSpec } from './watermark';

export type FontFamily = 'sans' | 'serif' | 'mono';
/** 'auto' reads the pixels underneath; the others force one. */
export type Ink = 'auto' | 'light' | 'dark';

export interface TextMark {
  kind: 'text';
  text: string;
  family: FontFamily;
  bold: boolean;
}

export interface ImageMark {
  kind: 'image';
  bitmap: ImageBitmap;
}

export type Mark = TextMark | ImageMark;

const STACKS: Record<FontFamily, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

/** Text is measured at this size and scaled; big enough that rounding does not bite. */
const REF_SIZE = 100;

/** Halo width as a fraction of the mark height, so the mark reads on either ground. */
const HALO = 0.08;

const LIGHT = '#ffffff';
const DARK = '#111111';

/** Width of the luma map sampled to choose ink. Coarse on purpose: it is an average. */
const PROBE = 64;

/** Above this mean luma the ground is light, so the mark goes dark. */
const LUMA_MID = 140;

export function inkFor(meanLuma: number): 'light' | 'dark' {
  return meanLuma > LUMA_MID ? 'dark' : 'light';
}

export type OutputType = 'image/jpeg' | 'image/png';

/**
 * What the result is encoded as, and whether that is a change of format.
 *
 * PNG keeps its alpha, JPEG stays JPEG. Everything else — HEIC from a phone,
 * WebP, AVIF — becomes JPEG, and `converted` is what lets the interface say so
 * rather than quietly handing back a different format.
 */
export function outputFor(sourceType: string): { type: OutputType; converted: boolean } {
  if (sourceType === 'image/png') return { type: 'image/png', converted: false };
  if (sourceType === 'image/jpeg') return { type: 'image/jpeg', converted: false };
  return { type: 'image/jpeg', converted: true };
}

export function watermarkedName(name: string, type: OutputType): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-watermarked.${type === 'image/png' ? 'png' : 'jpg'}`;
}

let scratch: CanvasRenderingContext2D | null = null;
function measuring(): CanvasRenderingContext2D {
  if (!scratch) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    scratch = ctx;
  }
  return scratch;
}

const fontOf = (mark: TextMark, size: number) =>
  `${mark.bold ? '700 ' : ''}${size}px ${STACKS[mark.family]}`;

interface TextMetricsBox {
  size: Size;
  /** Distance from the baseline to the top of the ink, at REF_SIZE. */
  ascent: number;
}

function measureMark(mark: TextMark): TextMetricsBox {
  const ctx = measuring();
  ctx.font = fontOf(mark, REF_SIZE);
  const m = ctx.measureText(mark.text);
  // The em box is not the ink box: "acme" and "Acme" have the same font size
  // and very different heights, and sizing by the em box would make one of them
  // visibly smaller than asked for.
  const ascent = m.actualBoundingBoxAscent;
  const height = ascent + m.actualBoundingBoxDescent;
  return { size: { width: m.width, height }, ascent };
}

/** The mark's natural proportions, which is all the planner needs. */
export function markSize(mark: Mark): Size {
  if (mark.kind === 'image') return { width: mark.bitmap.width, height: mark.bitmap.height };
  const { size } = measureMark(mark);
  return size.height > 0 && size.width > 0 ? size : { width: 0, height: 0 };
}

/** A coarse luma map of the image, used to pick ink per placement. */
function lumaMap(source: CanvasImageSource, width: number, height: number) {
  const w = Math.max(1, Math.min(PROBE, width));
  const h = Math.max(1, Math.round((w * height) / width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Same weights as core/document/enhance, so "how bright" means one thing here.
    luma[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  }
  return { luma, w, h };
}

function meanUnder(map: ReturnType<typeof lumaMap>, p: Placement, image: Size): number {
  const half = Math.max(p.w, p.h) / 2;
  const x0 = Math.max(0, Math.floor(((p.x - half) / image.width) * map.w));
  const x1 = Math.min(map.w - 1, Math.ceil(((p.x + half) / image.width) * map.w));
  const y0 = Math.max(0, Math.floor(((p.y - half) / image.height) * map.h));
  const y1 = Math.min(map.h - 1, Math.ceil(((p.y + half) / image.height) * map.h));
  let total = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total += map.luma[y * map.w + x]!;
      n++;
    }
  }
  return n > 0 ? total / n : 255;
}

/**
 * Draw the image with its watermark and hand back the canvas.
 *
 * Ink choice applies to text only. An uploaded logo is drawn as it is, because
 * recolouring somebody's artwork to suit the background is not a decision this
 * tool gets to make.
 */
export function paintWatermark(
  source: DecodedImage,
  mark: Mark,
  spec: WatermarkSpec,
  ink: Ink,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(source.bitmap, 0, 0);

  const image: Size = { width: source.width, height: source.height };
  const spots = placements(image, markSize(mark), spec);
  if (spots.length === 0) return canvas;

  const map = ink === 'auto' && mark.kind === 'text' ? lumaMap(source.bitmap, image.width, image.height) : null;
  const text = mark.kind === 'text' ? measureMark(mark) : null;

  ctx.save();
  ctx.globalAlpha = spec.opacity;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  for (const p of spots) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.angleDeg * Math.PI) / 180);

    if (mark.kind === 'image') {
      ctx.drawImage(mark.bitmap, -p.w / 2, -p.h / 2, p.w, p.h);
    } else {
      const scale = p.h / text!.size.height;
      const chosen = map ? inkFor(meanUnder(map, p, image)) : ink === 'dark' ? 'dark' : 'light';
      // The ink box is centred on the placement, so the baseline sits below the
      // middle by however much of the glyph hangs above it.
      const baseline = p.h / 2 - (text!.size.height - text!.ascent) * scale;
      ctx.font = fontOf(mark, REF_SIZE * scale);
      ctx.lineWidth = Math.max(1, p.h * HALO);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = chosen === 'dark' ? LIGHT : DARK;
      ctx.globalAlpha = spec.opacity * 0.45;
      ctx.strokeText(mark.text, 0, baseline);
      ctx.globalAlpha = spec.opacity;
      ctx.fillStyle = chosen === 'dark' ? DARK : LIGHT;
      ctx.fillText(mark.text, 0, baseline);
    }
    ctx.restore();
  }
  ctx.restore();
  return canvas;
}
