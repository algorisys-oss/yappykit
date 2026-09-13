/**
 * ffmpeg.wasm transcode wrapper (lazy, single-threaded).
 *
 * The universal path from docs/05-architecture.md: works in every browser and
 * needs NO cross-origin isolation (single-threaded core). The WebCodecs fast
 * path can slot in later behind the same interface. The ~30 MB core loads only
 * when the user actually compresses — never on the landing page.
 *
 * Core + wasm are imported with `?url` so Vite serves them same-origin (required
 * anyway on the isolated production route — see the generated `_headers` and
 * spike/coop-coep/FINDINGS.md). The wasm is additionally gzipped at build time
 * to fit the host's per-file size limit; see `coreWasmUrl` below.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import { buildTrimArgs, totalDuration, type Segment } from './trim';
import { buildBlurArgs, type BlurStrength, type Frame, type Mask } from './blur';
import { explainExit, rememberLine, toError } from './engine-error';

/**
 * Fetch the core's wasm and hand ffmpeg a blob URL for it.
 *
 * The binary is 30.7 MB and our host refuses any file over 25 MB, so the
 * production build ships it gzipped (9.8 MB) and we expand it here.
 *
 * The compressed file is named `.wasmz` rather than `.wasm.gz` deliberately: a
 * server that recognises the `.gz` name may serve it with `Content-Encoding:
 * gzip`, `fetch` would then decode it transparently, and the stream below would
 * try to decompress it a second time. An extension nothing special-cases makes
 * that class of bug unreachable.
 *
 * The dev server has no build step, so it serves the raw file.
 */
async function coreWasmUrl(): Promise<string> {
  if (!import.meta.env.PROD) return toBlobURL(wasmURL, 'application/wasm');
  const res = await fetch(wasmURL.replace(/\.wasm$/, '.wasmz'));
  if (!res.ok || !res.body) {
    throw new Error(`Could not fetch the video engine (${res.status}).`);
  }
  const expanded = await new Response(
    res.body.pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer();
  return URL.createObjectURL(new Blob([expanded], { type: 'application/wasm' }));
}

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let progressCb: ((fraction: number) => void) | null = null;
let logCb: ((line: string) => void) | null = null;
/** The last few engine log lines, which is where a failure is explained. */
const recentLog: string[] = [];

export function isLoaded(): boolean {
  return instance != null;
}

async function load(): Promise<FFmpeg> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg();
      ff.on('progress', (e: { progress: number }) => {
        if (progressCb) progressCb(Math.min(1, Math.max(0, e.progress)));
      });
      ff.on('log', (e: { message: string }) => {
        rememberLine(recentLog, e.message);
        if (logCb) logCb(e.message);
      });
      await ff.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await coreWasmUrl(),
      });
      instance = ff;
      return ff;
    })();
  }
  return loading;
}

/**
 * Run one encode, and fail loudly if ffmpeg did.
 *
 * `exec` resolves with ffmpeg's exit code instead of rejecting, so without this
 * a failed encode went on to read an output file that was missing or partial,
 * and the real cause stayed in a log nobody saw. See ./engine-error.
 */
async function run(ff: FFmpeg, args: string[]): Promise<void> {
  recentLog.length = 0;
  const code = await ff.exec(args);
  if (code !== 0) throw new Error(explainExit(code, recentLog));
}

export interface TranscodeOptions {
  videoKbps: number;
  audioKbps: number;
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/** Transcode `file` to H.264/AAC MP4 at the requested bitrate. Returns MP4 bytes. */
export async function transcodeVideo(file: File, opts: TranscodeOptions): Promise<Uint8Array> {
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  progressCb = opts.onProgress ?? null;
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `input${ext}`;
  const outName = 'output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    await run(ff, [
      '-i', inName,
      '-c:v', 'libx264',
      '-b:v', `${opts.videoKbps}k`,
      '-preset', 'veryfast',
      '-c:a', 'aac',
      '-b:a', `${opts.audioKbps}k`,
      '-movflags', '+faststart',
      outName,
    ]);
    const data = (await ff.readFile(outName)) as Uint8Array;
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    progressCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

/** `time=00:01:02.34` out of ffmpeg's own stats line. */
const TIME_LINE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** A stream listing line for an audio track, from ffmpeg's input summary. */
const AUDIO_STREAM = /Stream #\d+:\d+.*: Audio:/;

/**
 * Does this input carry an audio track?
 *
 * It has to be asked, because `concat` cannot take a stream that is not there:
 * building an audio branch for a GIF or a silent clip does not degrade, it
 * fails the whole encode. Running ffmpeg with no output is the cheap way to
 * ask — it prints the stream table, then exits complaining, having decoded
 * nothing.
 */
async function probeAudio(ff: FFmpeg, name: string): Promise<boolean> {
  let found = false;
  logCb = (line) => {
    if (AUDIO_STREAM.test(line)) found = true;
  };
  try {
    await ff.exec(['-i', name]);
  } catch {
    // No output file is an error by design; the stream table is already read.
  } finally {
    logCb = null;
  }
  return found;
}

export interface TrimOptions {
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/**
 * Cut `file` down to `keep` and return MP4 bytes.
 *
 * Progress is read from ffmpeg's own `time=` output rather than from the
 * library's progress event, which is documented as accurate only when the input
 * and output durations match — the one thing trimming always breaks.
 */
export async function trimVideo(
  file: File,
  keep: readonly Segment[],
  opts: TrimOptions = {},
): Promise<Uint8Array> {
  const expected = totalDuration(keep);
  if (expected <= 0) throw new Error('Nothing is selected to keep.');

  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `trim-input${ext}`;
  const outName = 'trim-output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const hasAudio = await probeAudio(ff, inName);

    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / expected)));
    };
    await run(ff, buildTrimArgs(keep, { input: inName, output: outName, hasAudio }));
    logCb = null;

    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The trimmed video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface BlurOptions {
  /** The source's own dimensions. The caller already has them from the preview. */
  frame: Frame;
  /** Source duration in seconds, which is also how long the export is. */
  duration: number;
  strength: BlurStrength;
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/**
 * Burn `masks` into `file` and return MP4 bytes.
 *
 * Every frame is decoded and re-encoded, because the blur has to be in the
 * pixels: there is no keyframe shortcut, so this takes about as long as the
 * clip plays. Progress is read from `time=` for the same reason as the trimmer.
 */
export async function blurVideo(
  file: File,
  masks: readonly Mask[],
  opts: BlurOptions,
): Promise<Uint8Array> {
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `blur-input${ext}`;
  const outName = 'blur-output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const hasAudio = await probeAudio(ff, inName);
    // Built after the probe, and before exec, so a mask list with nothing
    // usable in it fails here with a message rather than as an ffmpeg error.
    const args = buildBlurArgs(masks, {
      input: inName,
      output: outName,
      hasAudio,
      frame: opts.frame,
      duration: opts.duration,
      strength: opts.strength,
    });

    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || opts.duration <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / opts.duration)));
    };
    await run(ff, args);
    logCb = null;

    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The blurred video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}
