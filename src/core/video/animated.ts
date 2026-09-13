/**
 * A stretch of video as an animated GIF or WebP, under a size the user picks.
 *
 * The two levers on an animation's size are how big the picture is and how many
 * frames a second it has; quality settings barely move a GIF, whose palette is
 * 256 colours whatever you ask for. So `scale` (in the target-size engine's
 * vocabulary) is the long side and `quality` is the frame rate, and a size
 * model turns a byte budget into both. `fitAnimated` explains why the engine's
 * own loop is not the one used.
 *
 * The model is fitted to real clips, measured natively on 2026-09-13 (8 s of a
 * screen recording, a drawn animation and a lecture, at 320 to 640 px and 10
 * and 15 fps). Bytes grow with pixel area to the power 0.9 for GIF and 0.55 for
 * WebP, and with frame rate to 0.5 and 0.7. The constant in front is what
 * content changes: 0.36 to 1.6 for GIF and 1.7 to 15 for WebP across those three
 * clips. The constants here are the low end on purpose: the first encode is
 * then more likely to overshoot, which the next encode corrects knowing the
 * clip's real constant, than to come out small and stop.
 *
 * Pure, so it is tested without the engine. ./ffmpeg runs it.
 */
import type { EncodeParams } from '../target-size';
import { t } from './encode';

export type AnimatedFormat = 'gif' | 'webp';

export const LIMITS = {
  /** Past 640 px a GIF is megabytes a second for detail a chat app shrinks anyway. */
  maxLongSide: 640,
  minLongSide: 160,
  /** 15 fps reads as motion; more mostly buys size. */
  maxFps: 15,
  minFps: 6,
} as const;

/** The engine's `scale` floor: the smallest long side as a share of the largest. */
export const MIN_SCALE = LIMITS.minLongSide / LIMITS.maxLongSide;

/** A clip cut from the source; `fps` is null when the source did not say. */
export interface Clip {
  width: number;
  height: number;
  fps: number | null;
  duration: number;
}

export interface AnimatedSettings {
  width: number;
  height: number;
  fps: number;
}

const MODEL: Record<AnimatedFormat, { k: number; area: number; fps: number }> = {
  gif: { k: 0.36, area: 0.9, fps: 0.5 },
  webp: { k: 1.7, area: 0.55, fps: 0.7 },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

const maxLongOf = (clip: Clip) => Math.min(LIMITS.maxLongSide, Math.max(clip.width, clip.height));
const maxFpsOf = (clip: Clip) => Math.min(LIMITS.maxFps, clip.fps ?? LIMITS.maxFps);

/** Engine params to pixels and frames. Never above the source, never below the floors. */
export function settingsFor(params: EncodeParams, clip: Clip): AnimatedSettings {
  const maxLong = maxLongOf(clip);
  const long = clamp(params.scale * maxLong, Math.min(LIMITS.minLongSide, maxLong), maxLong);
  const maxFps = maxFpsOf(clip);
  const minFps = Math.min(LIMITS.minFps, maxFps);
  const fps = Math.round(minFps + clamp(params.quality, 0, 1) * (maxFps - minFps));
  const landscape = clip.width >= clip.height;
  const short = (long * Math.min(clip.width, clip.height)) / Math.max(clip.width, clip.height);
  return landscape
    ? { width: even(long), height: even(short), fps }
    : { width: even(short), height: even(long), fps };
}

/**
 * Expected bytes under the model. `factor` is how far this clip's content sits
 * above the model's constant; 1 before anything has been encoded.
 */
export function predictBytes(s: AnimatedSettings, duration: number, format: AnimatedFormat, factor = 1): number {
  const m = MODEL[format];
  return factor * m.k * Math.pow(s.width * s.height, m.area) * Math.pow(s.fps, m.fps) * duration;
}

/**
 * The best settings the model says fit in `budgetBytes`.
 *
 * The order things are given up in is a choice: size comes down first, to a
 * 320 px long side, because a smaller GIF still looks right and a choppy one
 * does not; then frame rate, to its floor; then size again, to its floor.
 */
export function guessParams(budgetBytes: number, clip: Clip, format: AnimatedFormat, factor = 1): EncodeParams {
  const s320 = clamp(320 / maxLongOf(clip), MIN_SCALE, 1);
  const along = (x: number): EncodeParams => {
    // x runs 1 (best) to 0 (smallest) over three legs of equal length.
    if (x >= 2 / 3) return { quality: 1, scale: s320 + (1 - s320) * (3 * x - 2) };
    if (x >= 1 / 3) return { quality: 3 * x - 1, scale: s320 };
    return { quality: 0, scale: MIN_SCALE + (s320 - MIN_SCALE) * 3 * x };
  };
  const bytes = (x: number) => predictBytes(settingsFor(along(x), clip), clip.duration, format, factor);

  if (bytes(1) <= budgetBytes) return { quality: 1, scale: 1 };
  if (bytes(0) > budgetBytes) return { quality: 0, scale: MIN_SCALE };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bytes(mid) <= budgetBytes) lo = mid;
    else hi = mid;
  }
  return along(lo);
}

const sameSettings = (a: AnimatedSettings, b: AnimatedSettings) =>
  a.width === b.width && a.height === b.height && a.fps === b.fps;

export interface FitResult {
  output: Uint8Array;
  settings: AnimatedSettings;
  withinBudget: boolean;
  encodes: number;
}

/** Aim this far under the budget once the clip's constant is known. */
const MARGIN = 0.92;
/** A fitting file smaller than this share of the budget is worth one more try. */
const UNDERSHOOT = 0.6;

/**
 * Encode until the animation fits `budgetBytes`, at most `maxEncodes` times.
 *
 * Not the target-size engine's analytic path, which corrects by the ratio of
 * the file to the budget. That ratio is only the content's error when the guess
 * tracked the budget, and the best settings are a cap: when the model says they
 * fit and they do not, the file-to-budget ratio understates the error and the
 * second encode overshoots again. Measured on a drawn animation, a 2 MB GIF
 * came out at 133% after both encodes. Here every encode instead teaches the
 * clip's real constant, actual bytes over predicted bytes, and the next guess
 * uses it.
 *
 * Keeps the largest file that fits, or the smallest one if none does, so a
 * further try can only make the answer better.
 */
export async function fitAnimated(opts: {
  clip: Clip;
  format: AnimatedFormat;
  budgetBytes: number;
  encode: (settings: AnimatedSettings) => Promise<Uint8Array>;
  maxEncodes?: number;
}): Promise<FitResult> {
  const { clip, format, budgetBytes, encode } = opts;
  const maxEncodes = opts.maxEncodes ?? 3;
  const best = settingsFor({ quality: 1, scale: 1 }, clip);
  const tried: AnimatedSettings[] = [];
  let factor = 1;
  let kept: FitResult | null = null;

  for (let i = 0; i < maxEncodes; i++) {
    const aim = i === 0 ? budgetBytes : budgetBytes * MARGIN;
    const settings = settingsFor(guessParams(aim, clip, format, factor), clip);
    if (tried.some((s) => sameSettings(s, settings))) break;
    tried.push(settings);

    const output = await encode(settings);
    const fits = output.byteLength <= budgetBytes;
    const candidate: FitResult = { output, settings, withinBudget: fits, encodes: i + 1 };
    if (
      kept === null ||
      (fits && !kept.withinBudget) ||
      (fits && kept.withinBudget && output.byteLength > kept.output.byteLength) ||
      (!fits && !kept.withinBudget && output.byteLength < kept.output.byteLength)
    ) {
      kept = candidate;
    }

    if (fits && (sameSettings(settings, best) || output.byteLength >= budgetBytes * UNDERSHOOT)) break;
    factor = output.byteLength / predictBytes(settings, clip.duration, format);
  }

  return { ...kept!, encodes: tried.length };
}

export interface AnimatedArgsOptions {
  input: string;
  output: string;
  format: AnimatedFormat;
  start: number;
  duration: number;
  settings: AnimatedSettings;
}

/**
 * Compile one encode.
 *
 * GIF gets a palette built from the clip itself rather than a fixed one, with
 * `stats_mode=diff` so the colours go to what moves, and `diff_mode=rectangle`
 * so unchanged areas are not rewritten every frame, which is most of what keeps
 * a screen recording small. Ordered dithering rather than error diffusion,
 * because diffusion noise changes every frame and defeats that.
 */
export function buildAnimatedArgs(opts: AnimatedArgsOptions): string[] {
  const { width, height, fps } = opts.settings;
  const picture = `fps=${fps},scale=${width}:${height}:flags=lanczos`;
  const seek = ['-ss', t(opts.start), '-t', t(opts.duration), '-i', opts.input];
  if (opts.format === 'gif') {
    return [
      ...seek,
      '-filter_complex',
      `${picture},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop', '0', '-an', opts.output,
    ];
  }
  return [...seek, '-vf', picture, '-c:v', 'libwebp_anim', '-quality', '75', '-loop', '0', '-an', opts.output];
}

/** A short clip whole; the first ten seconds of anything longer. */
export function defaultRange(duration: number): { start: number; end: number } {
  return { start: 0, end: Math.min(duration, 10) };
}
