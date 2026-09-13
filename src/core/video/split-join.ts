/**
 * Splitting one video into parts, and joining several into one.
 *
 * Splitting reuses the trimmer's single-piece encode for each part, so every cut
 * is frame accurate. Cutting at keyframes instead would copy without encoding,
 * but a part could then run past the limit it was cut for, and a 30 second
 * status that is 31 seconds long is refused.
 *
 * Joining has to reconcile clips that were never meant to meet: different
 * sizes, frame rates, and a phone clip with sound next to a screen recording
 * without. The graph fits each picture into the first clip's frame, puts every
 * clip on one frame rate, and makes each clip's sound exactly as long as the
 * clip, so nothing after the first join drifts.
 *
 * Pure, so it is tested without the engine. ./ffmpeg runs it.
 */
import type { Segment } from './trim';
import { encodeArgs, t } from './encode';

export type SplitMode = { kind: 'count'; count: number } | { kind: 'length'; seconds: number };

/** Story and status caps: Instagram and WhatsApp at 15 and 30 seconds, and a round minute. */
export const SPLIT_LENGTHS = [15, 30, 60] as const;

/** A remainder shorter than this is rounding, not a part. */
const SLIVER = 0.05;

export function splitRanges(duration: number, mode: SplitMode): Segment[] {
  const size = mode.kind === 'count' ? duration / mode.count : mode.seconds;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError('a part must have a length');
  const parts: Segment[] = [];
  for (let start = 0; duration - start > SLIVER; start += size) {
    parts.push({ start, end: Math.min(duration, start + size) });
  }
  // A final sliver was skipped by the loop; the last part runs to the real end.
  if (parts.length > 0) parts[parts.length - 1]!.end = duration;
  return parts;
}

/** `name-part-01-of-12.mp4`, padded so parts sort in order. */
export function partName(videoName: string, index: number, total: number): string {
  const dot = videoName.lastIndexOf('.');
  const stem = dot > 0 ? videoName.slice(0, dot) : videoName;
  const width = String(total).length;
  return `${stem}-part-${String(index + 1).padStart(width, '0')}-of-${total}.mp4`;
}

export interface JoinTarget {
  width: number;
  height: number;
  fps: number;
}

const even = (n: number) => Math.max(2, Math.ceil(n / 2) * 2);

/** The first clip decides the frame: it is usually the one people start from. */
export function joinTarget(clips: readonly { width: number; height: number; fps: number | null }[]): JoinTarget {
  const first = clips[0]!;
  return { width: even(first.width), height: even(first.height), fps: Math.min(60, first.fps ?? 30) };
}

export interface JoinClip {
  input: string;
  hasAudio: boolean;
  /** Seconds, the length every stream of this clip is made to match. */
  duration: number;
}

const AUDIO_FORMAT = 'aformat=sample_fmts=fltp:channel_layouts=stereo';

/**
 * Compile the join.
 *
 * Every stream of a clip is forced to the clip's length before `concat`, which
 * starts each clip where the longest stream of the previous one ended: a clip
 * whose sound stops half a second early would otherwise start the next clip's
 * sound half a second ahead of its picture, and the error adds up clip by clip.
 * Pictures are padded with their last frame, sound with silence.
 */
export function buildJoinArgs(clips: readonly JoinClip[], target: JoinTarget, output: string): string[] {
  if (clips.length < 2) throw new RangeError('joining needs at least two clips');
  const { width: W, height: H, fps } = target;
  const withAudio = clips.some((c) => c.hasAudio);

  const chains: string[] = [];
  clips.forEach((c, i) => {
    const d = t(c.duration);
    chains.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${t(fps)},format=yuv420p,` +
        `tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
    );
    if (!withAudio) return;
    chains.push(
      c.hasAudio
        ? `[${i}:a]aresample=48000,${AUDIO_FORMAT},apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},${AUDIO_FORMAT}[a${i}]`,
    );
  });
  const streams = clips.map((_, i) => (withAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
  chains.push(`${streams}concat=n=${clips.length}:v=1:a=${withAudio ? 1 : 0}${withAudio ? '[outv][outa]' : '[outv]'}`);

  return [
    ...clips.flatMap((c) => ['-i', c.input]),
    '-filter_complex', chains.join(';'),
    '-map', '[outv]',
    ...(withAudio ? ['-map', '[outa]'] : []),
    ...encodeArgs(withAudio),
    output,
  ];
}

/** Move the item at `index` one place up (-1) or down (1). */
export function moveItem<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  const copy = [...items];
  if (to < 0 || to >= copy.length) return copy;
  [copy[index], copy[to]] = [copy[to]!, copy[index]!];
  return copy;
}
