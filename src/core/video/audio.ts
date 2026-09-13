/**
 * Taking a video's sound away, or taking only its sound.
 *
 * Neither job needs the picture re-encoded, so neither does it. Muting copies
 * the video stream into a new file bit for bit and leaves the audio out, which
 * is lossless and takes seconds rather than as long as the clip plays.
 * Extracting copies the audio too when it already is the format asked for, an
 * AAC soundtrack into an M4A for instance, and only encodes when it has to.
 *
 * Copying has one condition the encoders do not: the container must be able to
 * hold the codec as it is. So a muted video keeps its source's own container,
 * and the stream table is read before anything is built.
 *
 * Pure, so it is tested without the engine. ./ffmpeg runs it.
 */

export type AudioFormat = 'mp3' | 'm4a' | 'wav';

export const AUDIO_FORMATS: Record<AudioFormat, { ext: string; mime: string }> = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg' },
  m4a: { ext: 'm4a', mime: 'audio/mp4' },
  wav: { ext: 'wav', mime: 'audio/wav' },
};

/** The codec each format holds natively, which is when a copy is possible. */
const NATIVE: Record<AudioFormat, (codec: string) => boolean> = {
  mp3: (c) => c === 'mp3',
  m4a: (c) => c === 'aac',
  wav: (c) => c === 'pcm_s16le',
};

const AUDIO_LINE = /Stream #\d+:\d+.*?: Audio: ([a-z0-9_]+)/;
const VIDEO_LINE = /Stream #\d+:\d+.*?: Video: /;

/** What ffmpeg's input summary says is in the file. */
export function streamsFrom(lines: readonly string[]): { audioCodec: string | null; hasVideo: boolean } {
  let audioCodec: string | null = null;
  let hasVideo = false;
  for (const line of lines) {
    const audio = AUDIO_LINE.exec(line);
    if (audio && audioCodec === null) audioCodec = audio[1]!;
    if (VIDEO_LINE.test(line)) hasVideo = true;
  }
  return { audioCodec, hasVideo };
}

const CONTAINERS: Record<string, { ext: string; mime: string }> = {
  mp4: { ext: 'mp4', mime: 'video/mp4' },
  m4v: { ext: 'mp4', mime: 'video/mp4' },
  mov: { ext: 'mov', mime: 'video/quicktime' },
  webm: { ext: 'webm', mime: 'video/webm' },
  mkv: { ext: 'mkv', mime: 'video/x-matroska' },
};

/**
 * Where a copied video stream goes.
 *
 * The source's own container, because that is the one known to hold its codec:
 * VP9 from a WebM belongs in a WebM. Anything unrecognised goes to Matroska,
 * which accepts practically every codec, rather than to an MP4 that might
 * refuse it and fail the whole job.
 */
export function containerFor(fileName: string): { ext: string; mime: string } {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  return CONTAINERS[ext] ?? CONTAINERS.mkv!;
}

export function canCopy(codec: string | null, format: AudioFormat): boolean {
  return codec !== null && NATIVE[format](codec);
}

const faststart = (name: string) => (/\.(mp4|m4a|mov)$/i.test(name) ? ['-movflags', '+faststart'] : []);

export function buildMuteArgs(opts: { input: string; output: string }): string[] {
  return ['-i', opts.input, '-map', '0:v:0', '-c:v', 'copy', '-an', ...faststart(opts.output), opts.output];
}

const ENCODE: Record<AudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-b:a', '192k'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
};

export function buildExtractArgs(opts: {
  input: string;
  output: string;
  format: AudioFormat;
  sourceCodec: string | null;
}): string[] {
  const codec = canCopy(opts.sourceCodec, opts.format) ? ['-c:a', 'copy'] : ENCODE[opts.format];
  return [
    '-i', opts.input,
    '-map', '0:a:0',
    '-vn',
    ...codec,
    ...(opts.format === 'm4a' ? ['-movflags', '+faststart'] : []),
    opts.output,
  ];
}

/** `stem + suffix + .ext`, keeping whatever the file was called. */
export function outputName(name: string, suffix: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}${suffix}.${ext}`;
}
