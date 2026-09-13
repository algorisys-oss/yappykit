/**
 * Reframing a video for where it is going: vertical for Reels, Shorts and
 * TikTok, square, 4:5 portrait, or landscape.
 *
 * There are two honest ways to change a video's shape and people want both.
 * Fill the frame: crop to the largest window of the new shape and choose which
 * part of the picture stays. Show everything: keep the whole picture, scaled to
 * fit, over a blurred copy of itself that fills the empty space, which is how a
 * landscape clip is usually posted vertically.
 *
 * As with the image cropper, a fraction is not a shape: every window here is
 * worked out in pixels and kept even, because the output is yuv420p and H.264
 * refuses odd dimensions.
 *
 * Pure, so it is tested without the engine. ./ffmpeg runs it.
 */
import type { PixelRect } from '../redact/regions';
import type { Frame } from './blur';
import { encodeArgs } from './encode';

/** Width divided by height, per destination. */
export const TARGETS = {
  vertical: 9 / 16,
  square: 1,
  portrait: 4 / 5,
  landscape: 16 / 9,
} as const;
export type TargetId = keyof typeof TARGETS;

export type ReframeMode = 'fill' | 'fit';

const floorEven = (n: number) => Math.max(0, Math.floor(n / 2) * 2);
const roundEven = (n: number) => Math.round(n / 2) * 2;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The crop window for a ratio, positioned by `pan` along its free axis.
 *
 * `pan` is 0 at the left or top and 1 at the right or bottom, as a fraction of
 * how far the window can travel. That is deliberately the same thing CSS
 * `object-position` means by a percentage, so the page previews the crop with
 * `object-fit: cover` and the same number, and the two cannot disagree.
 * Rounding goes down, so the window never pokes past the edge.
 */
export function cropWindow(frame: Frame, ratio: number, pan: number): PixelRect {
  const p = clamp01(pan);
  if (frame.width / frame.height > ratio) {
    const h = floorEven(frame.height);
    const w = Math.min(floorEven(h * ratio), floorEven(frame.width));
    const x = Math.min(floorEven(p * (frame.width - w)), floorEven(frame.width - w));
    return { x, y: 0, w, h };
  }
  const w = floorEven(frame.width);
  const h = Math.min(floorEven(w / ratio), floorEven(frame.height));
  const y = Math.min(floorEven(p * (frame.height - h)), floorEven(frame.height - h));
  return { x: 0, y, w, h };
}

/** Which way the window can move, or null when the shape already matches. */
export function panAxis(frame: Frame, ratio: number): 'x' | 'y' | null {
  const w = cropWindow(frame, ratio, 0);
  if (frame.width - w.w >= 2) return 'x';
  if (frame.height - w.h >= 2) return 'y';
  return null;
}

/**
 * The output size for Show everything.
 *
 * The source's short side becomes the output's short side, so a 1080p clip
 * reframed to vertical is 1080 by 1920: the picture is only ever scaled down to
 * fit, and nothing is invented by scaling it up.
 */
export function fitCanvas(frame: Frame, ratio: number): Frame {
  const short = floorEven(Math.min(frame.width, frame.height));
  return ratio >= 1
    ? { width: roundEven(short * ratio), height: short }
    : { width: short, height: roundEven(short / ratio) };
}

export interface ReframeArgsOptions {
  mode: ReframeMode;
  input: string;
  output: string;
  /** False for a silent clip. Guessing wrong here fails the encode. */
  hasAudio: boolean;
  frame: Frame;
  ratio: number;
  pan: number;
}

export function buildReframeArgs(opts: ReframeArgsOptions): string[] {
  const audio = opts.hasAudio ? ['-map', '0:a:0'] : [];

  if (opts.mode === 'fill') {
    const w = cropWindow(opts.frame, opts.ratio, opts.pan);
    return [
      '-i', opts.input,
      // setsar=1: a source with non-square pixels would otherwise be stretched
      // by players back into the old shape.
      '-vf', `crop=${w.w}:${w.h}:${w.x}:${w.y},setsar=1`,
      '-map', '0:v:0',
      ...audio,
      ...encodeArgs(opts.hasAudio),
      opts.output,
    ];
  }

  const c = fitCanvas(opts.frame, opts.ratio);
  const short = Math.min(c.width, c.height);
  // Heavy enough that the copy reads as texture rather than as a second picture,
  // and inside the half-resolution chroma plane's limit.
  const radius = Math.max(2, Math.min(Math.floor(short / 4), Math.round(short / 30)));
  const graph =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${c.width}:${c.height}:force_original_aspect_ratio=increase,crop=${c.width}:${c.height},boxblur=${radius}:2[b];` +
    `[fg]scale=${c.width}:${c.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2[f];` +
    `[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`;
  return [
    '-i', opts.input,
    '-filter_complex', graph,
    '-map', '[outv]',
    ...audio,
    ...encodeArgs(opts.hasAudio),
    opts.output,
  ];
}
