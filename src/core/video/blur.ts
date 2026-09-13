/**
 * Timed blur masks, and the ffmpeg filter graph they compile to.
 *
 * A mask is a rectangle plus a span: "this part of the frame, between these two
 * seconds". That is the whole model, and it is deliberately the same shape as
 * the trimmer's edit list next door — an ordered list of plain data, every edit
 * a transform of the list, all of it pure so it can be tested without the 30 MB
 * engine. A later annotator (text, arrows, callouts) is another renderer over
 * this same timed-region idea rather than a second way of describing one.
 *
 * The geometry comes from ../redact/regions unchanged. Storing a region as a
 * fraction of the frame rather than in pixels is the same problem the redactor
 * already solved: the box is drawn on a preview of whatever size the screen
 * allowed and applied at full resolution, and a fraction survives that change of
 * scale where a pixel coordinate does not.
 *
 * The encoder call lives in ./ffmpeg.
 */
import { isDegenerate, toPixels, type PixelRect, type Rect } from '../redact/regions';
import { MIN_SEGMENT_SEC } from './trim';
import { EVEN_DIMENSIONS, encodeArgs, t } from './encode';

export type BlurStrength = 'strong' | 'soft';

/** A stretch of the source in seconds. Shared by everything drawn over a video. */
export interface Span {
  start: number;
  end: number;
}

export interface Mask extends Span {
  rect: Rect;
}

export interface Frame {
  width: number;
  height: number;
}


/**
 * How hard to blur, as a fraction of the region's short side.
 *
 * A fixed radius is the wrong control: 10 pixels of blur hides a 40 px face and
 * barely softens a 400 px one. Scaling by the region means "unrecognisable"
 * means the same thing wherever the box is drawn.
 */
const FACTOR: Record<BlurStrength, number> = { strong: 0.18, soft: 0.07 };

/** Box blur applied N times approaches a gaussian. Repeating it is what makes
 *  the strong setting actually unrecoverable rather than merely smeared. */
const POWER: Record<BlurStrength, number> = { strong: 3, soft: 1 };


/** The dimensions after `pad`, which is what the crop coordinates are relative to. */
export function evenFrame(frame: Frame): Frame {
  return {
    width: Math.ceil(frame.width / 2) * 2,
    height: Math.ceil(frame.height / 2) * 2,
  };
}

/**
 * A fractional region as an even-aligned pixel box of the padded frame.
 *
 * Everything is even because the output is yuv420p, whose chroma planes are
 * half resolution: an odd origin puts the blurred region half a chroma sample
 * away from the luma it is meant to cover, which shows up as a coloured fringe
 * along the edge of the box. Like `toPixels`, the rounding goes OUTWARD, so the
 * box never ends up smaller than what was drawn.
 */
export function toEvenPixels(rect: Rect, frame: Frame): PixelRect {
  const f = evenFrame(frame);
  const px = toPixels(rect, f.width, f.height);

  const x = px.x - (px.x % 2);
  const y = px.y - (px.y % 2);
  let w = Math.ceil((px.x + px.w - x) / 2) * 2;
  let h = Math.ceil((px.y + px.h - y) / 2) * 2;
  // Both the frame and the origin are even, so clamping keeps the size even.
  if (x + w > f.width) w = f.width - x;
  if (y + h > f.height) h = f.height - y;

  return { x, y, w: Math.max(2, w), h: Math.max(2, h) };
}

/**
 * Box blur radius for a region of this size.
 *
 * Capped at a quarter of the short side rather than a half: the limit that
 * matters is the chroma plane, which is half the luma's resolution, and a
 * radius wider than the plane is an error rather than a stronger blur.
 */
export function blurRadius(shortSidePx: number, strength: BlurStrength): number {
  const cap = Math.max(1, Math.floor(shortSidePx / 4));
  return Math.min(cap, Math.max(1, Math.round(shortSidePx * FACTOR[strength])));
}

export function blurPower(strength: BlurStrength): number {
  return POWER[strength];
}

/**
 * The masks worth encoding.
 *
 * A click that never became a drag leaves a rectangle too small to have been
 * meant, and a span dragged backwards or to zero width covers no frames. Both
 * are silently dropped rather than encoded, because both come from the UI doing
 * what the pointer said rather than from the user asking for anything.
 */
export function usableMasks(masks: readonly Mask[]): Mask[] {
  return masks.filter((m) => !isDegenerate(m.rect) && m.end > m.start);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Move a span's start to `at`, keeping everything else about it.
 *
 * "Start here" pressed after the mask's current end means "from now on", so
 * rather than refusing, or producing a span that covers nothing, the end runs
 * on to the end of the clip.
 */
export function withStart<T extends Span>(m: T, at: number, duration: number): T {
  const start = clamp(at, 0, Math.max(0, duration - MIN_SEGMENT_SEC));
  const end = start + MIN_SEGMENT_SEC <= m.end ? m.end : duration;
  return { ...m, start, end };
}

/** Move a span's end to `at`; one placed before the start runs back to zero. */
export function withEnd<T extends Span>(m: T, at: number, duration: number): T {
  const end = clamp(at, Math.min(MIN_SEGMENT_SEC, duration), duration);
  const start = end - MIN_SEGMENT_SEC >= m.start ? m.start : 0;
  return { ...m, start, end };
}

export interface BlurArgsOptions {
  input: string;
  output: string;
  /** False for a GIF or a silent clip. Guessing wrong here fails the encode. */
  hasAudio: boolean;
  /** The source's own dimensions, before padding. */
  frame: Frame;
  /** Source duration, to know whether a mask covers the whole clip. */
  duration: number;
  strength: BlurStrength;
}

/**
 * Compile masks into ffmpeg arguments.
 *
 * `split` hands out one copy of the padded source per mask plus the base being
 * drawn on, so every blurred patch is cropped from the PRISTINE frame. Cropping
 * from the running composite instead would let two overlapping boxes blur each
 * other twice, which looks like a bug and is one.
 *
 * The whole clip is re-encoded. There is no way around it: the blur has to be
 * burned into the pixels, so every frame has to be decoded, painted and written
 * again, and the trimmer's trick of seeking the input first does not apply.
 */
export function buildBlurArgs(masks: readonly Mask[], opts: BlurArgsOptions): string[] {
  const use = usableMasks(masks);
  if (use.length === 0) throw new RangeError('nothing to blur');

  const boxes = use.map((m) => toEvenPixels(m.rect, opts.frame));
  const power = blurPower(opts.strength);

  const chains: string[] = [];
  const taps = use.map((_, i) => `[s${i}]`).join('');
  chains.push(`[0:v]${EVEN_DIMENSIONS},split=${use.length + 1}[base]${taps}`);

  boxes.forEach((px, i) => {
    const radius = blurRadius(Math.min(px.w, px.h), opts.strength);
    chains.push(
      `[s${i}]crop=${px.w}:${px.h}:${px.x}:${px.y},boxblur=${radius}:${power}[m${i}]`,
    );
  });

  use.forEach((m, i) => {
    const px = boxes[i]!;
    const from = i === 0 ? '[base]' : `[v${i - 1}]`;
    const to = i === use.length - 1 ? '[outv]' : `[v${i}]`;
    // An always-on mask needs no gate, and `enable` is evaluated per frame.
    const whole = m.start <= 0 && m.end >= opts.duration;
    const gate = whole ? '' : `:enable='between(t,${t(m.start)},${t(m.end)})'`;
    chains.push(`${from}[m${i}]overlay=${px.x}:${px.y}${gate}${to}`);
  });

  return [
    '-i',
    opts.input,
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[outv]',
    ...(opts.hasAudio ? ['-map', '0:a'] : []),
    ...encodeArgs(opts.hasAudio),
    opts.output,
  ];
}
