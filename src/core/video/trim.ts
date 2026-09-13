/**
 * The edit list behind the video trimmer, and the ffmpeg argv it compiles to.
 *
 * A trim is not "a start and an end" for long: the moment you want the cough in
 * the middle gone, one range becomes several. So the tool's state is an ordered
 * list of KEEP segments in source time, and every edit is a transform of that
 * list. Cutting a range out of the middle splits a segment in two; that is the
 * whole trick, and it is why later features (mute, speed, crop) can be further
 * ops over the same list rather than a rewrite.
 *
 * Everything here is pure so it can be tested without the 30 MB wasm engine.
 * The encoder call lives in ./ffmpeg.
 */

import { EVEN_DIMENSIONS, encodeArgs, t } from './encode';

export interface Segment {
  /** Seconds from the start of the source. */
  start: number;
  end: number;
}

/**
 * Segments shorter than this are dropped rather than encoded.
 *
 * Dragging a cut to almost-but-not-quite the start leaves a few-millisecond
 * sliver that nobody meant to keep, and that some encoders refuse outright.
 */
export const MIN_SEGMENT_SEC = 0.05;


/**
 * Subtract `cut` from the kept segments.
 *
 * A cut that falls inside one segment splits it; one that spans several trims
 * the outer two and deletes what is between them. A zero-width or inverted cut
 * removes nothing, because that is what it means, and the UI can produce one
 * from a click that never became a drag.
 */
export function removeRange(keep: readonly Segment[], cut: Segment): Segment[] {
  if (!(cut.end > cut.start)) return keep.map((s) => ({ ...s }));

  const out: Segment[] = [];
  for (const s of keep) {
    if (cut.end <= s.start || cut.start >= s.end) {
      out.push({ ...s });
      continue;
    }
    if (cut.start > s.start) out.push({ start: s.start, end: Math.min(cut.start, s.end) });
    if (cut.end < s.end) out.push({ start: Math.max(cut.end, s.start), end: s.end });
  }
  return out.filter((s) => s.end - s.start >= MIN_SEGMENT_SEC);
}

/** How long the export will be — the kept time, not the source's span. */
export function totalDuration(keep: readonly Segment[]): number {
  return keep.reduce((sum, s) => sum + (s.end - s.start), 0);
}

export interface TrimArgsOptions {
  input: string;
  output: string;
  /** False for a GIF or a silent clip. Guessing wrong here fails the encode. */
  hasAudio: boolean;
}

/**
 * Compile an edit list into ffmpeg arguments.
 *
 * One segment takes the fast path: `-ss` before `-i` seeks the input, so
 * trimming ten seconds out of a ten-minute video does not decode the nine
 * minutes in front of it. The duration is given as `-t` rather than `-to`
 * because `-to` as an input option has a long history of ambiguity about what
 * it is relative to, and being wrong there is silently wrong.
 *
 * Several segments get the same trick once each: every kept range is its own
 * seeked input, and the filter graph only concatenates them. The removed
 * stretches are never decoded. The earlier graph trimmed ranges out of a single
 * decode from zero, so keeping a minute near the end of a two hour recording
 * first decoded the two hours in front of it, and the progress bar stood still
 * for minutes while it did. Measured on that recording, two 30 s pieces two
 * hours apart took 137 to 151 s that way and 6 s this way, with every output
 * frame identical. Cuts stay frame accurate because an input seek while
 * transcoding decodes from the keyframe before the seek point and discards up to
 * it; nothing is cut on a keyframe boundary.
 */
export function buildTrimArgs(keep: readonly Segment[], opts: TrimArgsOptions): string[] {
  if (keep.length === 0) throw new RangeError('nothing to keep');

  const encode = encodeArgs(opts.hasAudio);

  if (keep.length === 1) {
    const only = keep[0]!;
    return [
      '-ss', t(only.start),
      '-t', t(only.end - only.start),
      '-i', opts.input,
      '-vf', EVEN_DIMENSIONS,
      ...encode,
      opts.output,
    ];
  }

  const inputs = keep.flatMap((s) => [
    '-ss', t(s.start),
    '-t', t(s.end - s.start),
    '-i', opts.input,
  ]);
  const streams = keep.map((_, i) => (opts.hasAudio ? `[${i}:v][${i}:a]` : `[${i}:v]`)).join('');
  const outputs = opts.hasAudio ? '[cv][outa]' : '[cv]';
  const graph =
    `${streams}concat=n=${keep.length}:v=1:a=${opts.hasAudio ? 1 : 0}${outputs};` +
    `[cv]${EVEN_DIMENSIONS}[outv]`;

  return [
    ...inputs,
    '-filter_complex', graph,
    '-map', '[outv]',
    ...(opts.hasAudio ? ['-map', '[outa]'] : []),
    ...encode,
    opts.output,
  ];
}

/** Seconds as `mm:ss.d`, counting on in minutes past an hour. */
export function formatTimecode(sec: number): string {
  const deci = Math.max(0, Math.round(sec * 10));
  const minutes = Math.floor(deci / 600);
  const rest = deci - minutes * 600;
  const seconds = Math.floor(rest / 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${rest % 10}`;
}

/**
 * Read `mm:ss.d`, `hh:mm:ss.d` or a bare number of seconds.
 *
 * Returns null rather than NaN or 0 so a half-typed field reads as "not a time
 * yet" instead of as the start of the video.
 */
export function parseTimecode(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const ok = i === parts.length - 1 ? /^\d+(\.\d+)?$/.test(part) : /^\d+$/.test(part);
    if (!ok) return null;
  }
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}
