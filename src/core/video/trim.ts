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

/** x264 quality. Re-encoding is unavoidable for a frame-accurate cut, so this
 *  is set for "you cannot see the difference" rather than for a size target —
 *  the compressor is the tool for hitting a size. */
const CRF = '20';
const AUDIO_KBPS = '128k';

/** libx264 with yuv420p needs even dimensions, and plenty of GIFs are odd. */
const EVEN_DIMENSIONS = 'pad=ceil(iw/2)*2:ceil(ih/2)*2';

/** Drop the float noise that turns 6 into "6.000000000000001" in an argument. */
const t = (n: number) => String(Number(n.toFixed(3)));

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
 * Several segments have to be decoded and stitched, which means a filter graph
 * and a decode from zero. There is no way around that: the cuts are frame
 * accurate, so the frames have to exist.
 */
export function buildTrimArgs(keep: readonly Segment[], opts: TrimArgsOptions): string[] {
  if (keep.length === 0) throw new RangeError('nothing to keep');

  const encode = [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', CRF,
    '-pix_fmt', 'yuv420p',
    ...(opts.hasAudio ? ['-c:a', 'aac', '-b:a', AUDIO_KBPS] : ['-an']),
    '-movflags', '+faststart',
  ];

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

  const chains: string[] = [];
  const concatInputs: string[] = [];
  keep.forEach((s, i) => {
    const range = `start=${t(s.start)}:end=${t(s.end)}`;
    chains.push(`[0:v]trim=${range},setpts=PTS-STARTPTS[v${i}]`);
    concatInputs.push(`[v${i}]`);
    if (opts.hasAudio) {
      chains.push(`[0:a]atrim=${range},asetpts=PTS-STARTPTS[a${i}]`);
      concatInputs.push(`[a${i}]`);
    }
  });

  const outputs = opts.hasAudio ? '[cv][outa]' : '[cv]';
  chains.push(
    `${concatInputs.join('')}concat=n=${keep.length}:v=1:a=${opts.hasAudio ? 1 : 0}${outputs}`,
  );
  chains.push(`[cv]${EVEN_DIMENSIONS}[outv]`);

  return [
    '-i', opts.input,
    '-filter_complex', chains.join(';'),
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
