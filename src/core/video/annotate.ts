/**
 * Annotations drawn over a video, and the ffmpeg graph that burns them in.
 *
 * An annotation is two points in 0..1 of the frame plus a span, the same
 * timed-region idea as a blur mask. What the points mean depends on the kind:
 * the corners of a rectangle or an ellipse, the tail and head of an arrow, the
 * point a callout calls out and the centre of its box, the centre of text.
 *
 * Nothing is drawn by ffmpeg. The browser paints each annotation into a
 * transparent PNG through ./annotate-paint, the same function that paints the
 * live preview, and ffmpeg only lays those images over the frames. So the
 * preview and the export cannot disagree about fonts, sizes or position, and no
 * font file has to be shipped inside the engine for `drawtext`.
 *
 * Everything here is pure, so it is tested without a canvas or the engine.
 */
import type { Point, PixelRect } from '../redact/regions';
import { evenFrame, type Frame, type Span } from './blur';
import { EVEN_DIMENSIONS, encodeArgs, t } from './encode';

export type AnnotationKind = 'text' | 'rect' | 'ellipse' | 'arrow' | 'callout';
export type TextSize = 's' | 'm' | 'l';

/**
 * The colours offered, as literal values.
 *
 * The site's own UI takes every colour from the shared palette tokens. These
 * are not UI: they are pixels a user burns into their own footage, chosen to
 * stand out on video, and they must not change when the site's theme does.
 */
export const COLOURS = {
  yellow: '#ffd60a',
  red: '#ff3b30',
  green: '#30d158',
  blue: '#0a84ff',
  white: '#ffffff',
  black: '#111111',
} as const;
export type ColourName = keyof typeof COLOURS;

export interface Annotation extends Span {
  kind: AnnotationKind;
  a: Point;
  b: Point;
  text: string;
  colour: ColourName;
  size: TextSize;
}

export interface Size {
  width: number;
  height: number;
}

/** Smaller than this in either direction and a shape was a click, not a drag. */
const MIN_FRACTION = 0.005;

/** Text height as a fraction of the frame height, per size. */
const FONT: Record<TextSize, number> = { s: 0.045, m: 0.065, l: 0.095 };

export function strokeWidth(frame: Frame): number {
  return Math.max(2, Math.round(frame.height * 0.006));
}

export function fontPx(size: TextSize, frame: Frame): number {
  return frame.height * FONT[size];
}

/** How far an arrow head reaches back from the tip, and how wide it opens. */
export const headLength = (stroke: number) => stroke * 4.5;
const HEAD_ANGLE = (28 * Math.PI) / 180;

/**
 * The two back corners of an arrow head, or null for an arrow with no length.
 *
 * A zero-length arrow has no direction, and dividing by its length would put
 * NaN into the canvas path, which draws nothing at best.
 */
export function arrowHead(a: Point, b: Point, stroke: number): [Point, Point] | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const back = headLength(stroke) * Math.cos(HEAD_ANGLE);
  const side = headLength(stroke) * Math.sin(HEAD_ANGLE);
  const bx = b.x - ux * back;
  const by = b.y - uy * back;
  return [
    { x: bx - uy * side, y: by + ux * side },
    { x: bx + uy * side, y: by - ux * side },
  ];
}

const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * Black or white text on a fill, whichever contrasts more (WCAG).
 *
 * Decided by the numbers rather than by what looks conventional: white on red
 * is the reflex, but on this bright red black has nearly twice the contrast.
 */
export function inkOn(colour: ColourName): '#000000' | '#ffffff' {
  const hex = COLOURS[colour];
  const lum = 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const onBlack = (lum + 0.05) / 0.05;
  const onWhite = 1.05 / (lum + 0.05);
  return onBlack >= onWhite ? '#000000' : '#ffffff';
}

/** Whether an annotation draws anything at all. */
export function isUsable(a: Annotation): boolean {
  if (!(a.end > a.start)) return false;
  switch (a.kind) {
    case 'text':
    case 'callout':
      return a.text.trim().length > 0;
    case 'arrow':
      return Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y) >= MIN_FRACTION * 2;
    default:
      return Math.abs(a.b.x - a.a.x) >= MIN_FRACTION && Math.abs(a.b.y - a.a.y) >= MIN_FRACTION;
  }
}

/** Space between a text's ink and anything around it, in proportion to the text. */
export const textPad = (measured: Size) => Math.ceil(measured.height * 0.25) + 2;

/** A callout's box: the measured text plus padding, centred on `centre`. */
export function calloutBox(centre: Point, measured: Size, frame: Frame): PixelRect {
  void frame;
  const padX = measured.height * 0.5;
  const padY = measured.height * 0.35;
  const w = measured.width + padX * 2;
  const h = measured.height + padY * 2;
  return { x: centre.x - w / 2, y: centre.y - h / 2, w, h };
}

/** The point on a rectangle's edge closest to `p`, where a callout's tail meets it. */
export function nearestOnRect(p: Point, r: PixelRect): Point {
  const x = Math.min(r.x + r.w, Math.max(r.x, p.x));
  const y = Math.min(r.y + r.h, Math.max(r.y, p.y));
  const inside = x === p.x && y === p.y;
  if (!inside) return { x, y };
  // Inside the box: out through the nearest side.
  const d = [p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y];
  const i = d.indexOf(Math.min(...d));
  return [
    { x: r.x, y: p.y },
    { x: r.x + r.w, y: p.y },
    { x: p.x, y: r.y },
    { x: p.x, y: r.y + r.h },
  ][i]!;
}

export const px = (p: Point, frame: Frame): Point => ({ x: p.x * frame.width, y: p.y * frame.height });

/**
 * The even-aligned pixel rectangle an annotation's image covers.
 *
 * It holds the whole of the drawing: half a stroke outside a rectangle's edge,
 * an arrow head's wings beyond the shaft, a text's halo, a callout's box and the
 * dot at its tail. Aligned outward to even pixels like the blur crops, so the
 * overlay sits on whole chroma samples, and clamped to the padded frame.
 * `measured` is the text's size at its font, which only a canvas can know.
 */
export function layerFor(a: Annotation, frame: Frame, measured: Size | null): PixelRect {
  const stroke = strokeWidth(frame);
  const pa = px(a.a, frame);
  const pb = px(a.b, frame);
  let x0: number, y0: number, x1: number, y1: number, pad: number;

  if (a.kind === 'text') {
    const m = measured ?? { width: 0, height: 0 };
    x0 = pb.x - m.width / 2;
    x1 = pb.x + m.width / 2;
    y0 = pb.y - m.height / 2;
    y1 = pb.y + m.height / 2;
    pad = textPad(m);
  } else if (a.kind === 'callout') {
    const box = calloutBox(pb, measured ?? { width: 0, height: 0 }, frame);
    x0 = Math.min(box.x, pa.x);
    x1 = Math.max(box.x + box.w, pa.x);
    y0 = Math.min(box.y, pa.y);
    y1 = Math.max(box.y + box.h, pa.y);
    pad = stroke * 2;
  } else {
    x0 = Math.min(pa.x, pb.x);
    x1 = Math.max(pa.x, pb.x);
    y0 = Math.min(pa.y, pb.y);
    y1 = Math.max(pa.y, pb.y);
    pad = a.kind === 'arrow' ? headLength(stroke) + stroke : stroke;
  }

  const f = evenFrame(frame);
  const down = (n: number) => Math.max(0, Math.floor(n / 2) * 2);
  const up = (n: number, max: number) => Math.min(max, Math.ceil(n / 2) * 2);
  const x = Math.min(down(x0 - pad), f.width - 2);
  const y = Math.min(down(y0 - pad), f.height - 2);
  const right = Math.max(x + 2, up(x1 + pad, f.width));
  const bottom = Math.max(y + 2, up(y1 + pad, f.height));
  return { x, y, w: right - x, h: bottom - y };
}

/** One painted annotation, as the engine sees it. */
export interface Layer extends Span {
  /** The PNG's name in the engine's filesystem. */
  name: string;
  x: number;
  y: number;
}

export interface AnnotateArgsOptions {
  input: string;
  output: string;
  /** False for a silent clip. Guessing wrong here fails the encode. */
  hasAudio: boolean;
  /** Source duration, to know whether a layer covers the whole clip. */
  duration: number;
}

/**
 * Compile painted layers into ffmpeg arguments.
 *
 * Each PNG is a single-frame input. `overlay` repeats an input's last frame
 * once it runs out, which is its default, so one still image is enough to cover
 * any span without looping it; `enable` decides when it is shown.
 */
export function buildAnnotateArgs(layers: readonly Layer[], opts: AnnotateArgsOptions): string[] {
  if (layers.length === 0) throw new RangeError('nothing to draw');

  const chains = [`[0:v]${EVEN_DIMENSIONS}[b0]`];
  layers.forEach((l, i) => {
    const to = i === layers.length - 1 ? '[outv]' : `[b${i + 1}]`;
    const whole = l.start <= 0 && l.end >= opts.duration;
    const gate = whole ? '' : `:enable='between(t,${t(l.start)},${t(l.end)})'`;
    chains.push(`[b${i}][${i + 1}:v]overlay=${l.x}:${l.y}${gate}${to}`);
  });

  return [
    '-i', opts.input,
    ...layers.flatMap((l) => ['-i', l.name]),
    '-filter_complex', chains.join(';'),
    '-map', '[outv]',
    ...(opts.hasAudio ? ['-map', '0:a'] : []),
    ...encodeArgs(opts.hasAudio),
    opts.output,
  ];
}
