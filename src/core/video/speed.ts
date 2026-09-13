/**
 * Speeding a video up or slowing it down, all of it or a stretch at a time.
 *
 * The state is a list of pieces that covers the whole clip, each with its own
 * speed, so "4x through the setup, normal for the talking" is one list rather
 * than a series of exports. Changing a stretch splits the pieces it lands in,
 * the same way the trimmer's `removeRange` splits kept segments. Unlike a trim
 * nothing is ever removed: the pieces always add up to the source.
 *
 * The encode reuses the trimmer's fast shape. Each piece is its own seeked
 * input, re-timed on its own, and the graph concatenates them.
 *
 * Pure, so it is tested without the engine. ./ffmpeg runs it.
 */
import { MIN_SEGMENT_SEC, type Segment } from './trim';
import { EVEN_DIMENSIONS, encodeArgs, t } from './encode';

export interface Piece extends Segment {
  speed: number;
}

/**
 * The range offered. A quarter speed is already a crawl, and 16x turns an hour
 * of screen recording into under four minutes; past that the picture is a blur
 * of dropped frames and the sound is noise.
 */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 16;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Give `range` the speed `speed`, splitting whatever pieces it lands in.
 *
 * An edge within a sliver of an existing boundary snaps to it, because a
 * selection dragged to almost the end of the clip means the end, and a 20 ms
 * piece at its own speed is nothing anyone asked for. Neighbours that end up at
 * the same speed are merged, which is what makes setting 1x an undo.
 */
export function setSpeed(pieces: readonly Piece[], range: Segment, speed: number): Piece[] {
  const copy = pieces.map((p) => ({ ...p }));
  const clipEnd = pieces[pieces.length - 1]?.end ?? 0;
  const edges = [0, clipEnd, ...pieces.flatMap((p) => [p.start, p.end])];
  const snap = (x: number) => {
    const at = clamp(x, 0, clipEnd);
    return edges.find((e) => Math.abs(e - at) < MIN_SEGMENT_SEC) ?? at;
  };

  const a = snap(range.start);
  const b = snap(range.end);
  if (!(b - a >= MIN_SEGMENT_SEC)) return copy;

  const before: Piece[] = [];
  const after: Piece[] = [];
  for (const p of copy) {
    if (p.start < a) before.push({ start: p.start, end: Math.min(p.end, a), speed: p.speed });
    if (p.end > b) after.push({ start: Math.max(p.start, b), end: p.end, speed: p.speed });
  }

  const merged: Piece[] = [];
  for (const p of [...before, { start: a, end: b, speed: clamp(speed, MIN_SPEED, MAX_SPEED) }, ...after]) {
    const last = merged[merged.length - 1];
    if (last && last.speed === p.speed && last.end === p.start) last.end = p.end;
    else merged.push(p);
  }
  return merged;
}

/** How long the export will be. */
export function outputDuration(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, p) => sum + (p.end - p.start) / p.speed, 0);
}

/**
 * The speed that makes a clip of `duration` last `target`.
 *
 * Rounded to three places, which is what reaches the engine anyway, so the
 * speed shown and the speed encoded are the same number. A target outside the
 * range comes back clamped and flagged, so the page can say it cannot get there
 * instead of quietly producing a different length.
 */
export function speedToFit(duration: number, target: number): { speed: number; clamped: boolean } | null {
  if (!(target > 0) || !(duration > 0)) return null;
  const raw = duration / target;
  const speed = Number(clamp(raw, MIN_SPEED, MAX_SPEED).toFixed(3));
  return { speed, clamped: raw < MIN_SPEED || raw > MAX_SPEED };
}

/**
 * Change the audio's speed without changing its pitch.
 *
 * `atempo` takes 0.5 to 100 in one step, so anything slower is a chain of
 * halves with the remainder last.
 */
export function atempoChain(speed: number): string {
  if (speed === 1) return 'anull';
  const steps: string[] = [];
  let rest = speed;
  while (rest < 0.5) {
    steps.push('atempo=0.5');
    rest /= 0.5;
  }
  if (rest !== 1) steps.push(`atempo=${t(rest)}`);
  return steps.join(',');
}

const VIDEO_LINE = /Stream #\d+:\d+.*?: Video: /;
const FPS = /, (\d+(?:\.\d+)?) fps\b/;
const TBR = /, (\d+(?:\.\d+)?) tbr\b/;

/**
 * The source's frame rate, from ffmpeg's input summary.
 *
 * `fps` is the average the demuxer measured. A variable rate recording can
 * omit it, and then `tbr`, ffmpeg's own best guess, is the next honest answer.
 */
export function frameRateFrom(lines: readonly string[]): number | null {
  for (const line of lines) {
    if (!VIDEO_LINE.test(line)) continue;
    const found = FPS.exec(line) ?? TBR.exec(line);
    if (found) return Number(found[1]);
  }
  return null;
}

export interface SpeedArgsOptions {
  input: string;
  output: string;
  /** False for a silent clip. Guessing wrong here fails the encode. */
  hasAudio: boolean;
  /** The source's frame rate, or null when it could not be read. */
  fps: number | null;
}

/**
 * Compile the pieces into ffmpeg arguments.
 *
 * `setpts` divides a piece's timestamps by its speed, so at 4x a 30 fps clip
 * arrives with frames every 1/120 s and at 0.5x every 1/15 s. `fps` then brings
 * each piece back to the source's rate: fast pieces drop the frames nobody could
 * see, which also means they cost less to encode, and slow pieces repeat frames
 * rather than leave a player to guess. With every piece at one rate and one
 * timebase, `concat` joins them cleanly.
 */
export function buildSpeedArgs(pieces: readonly Piece[], opts: SpeedArgsOptions): string[] {
  if (pieces.length === 0) throw new RangeError('nothing to encode');

  const inputs = pieces.flatMap((p) => ['-ss', t(p.start), '-t', t(p.end - p.start), '-i', opts.input]);
  const rate = opts.fps ? `,fps=${t(opts.fps)}` : '';

  const chains: string[] = [];
  pieces.forEach((p, i) => {
    chains.push(`[${i}:v]setpts=(PTS-STARTPTS)/${t(p.speed)}${rate}[v${i}]`);
    if (opts.hasAudio) chains.push(`[${i}:a]${atempoChain(p.speed)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const streams = pieces.map((_, i) => (opts.hasAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
  const outputs = opts.hasAudio ? '[cv][outa]' : '[cv]';
  chains.push(`${streams}concat=n=${pieces.length}:v=1:a=${opts.hasAudio ? 1 : 0}${outputs}`);
  chains.push(`[cv]${EVEN_DIMENSIONS}[outv]`);

  return [
    ...inputs,
    '-filter_complex', chains.join(';'),
    '-map', '[outv]',
    ...(opts.hasAudio ? ['-map', '[outa]'] : []),
    ...encodeArgs(opts.hasAudio),
    opts.output,
  ];
}
