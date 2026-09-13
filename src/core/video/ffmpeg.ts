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
import { buildAnnotateArgs } from './annotate';
import { buildReframeArgs, type ReframeMode } from './reframe';
import { buildExtractArgs, buildMuteArgs, streamsFrom, type AudioFormat } from './audio';
import { buildSpeedArgs, frameRateFrom, outputDuration, type Piece } from './speed';
import { buildAnimatedArgs, fitAnimated, type AnimatedFormat, type FitResult } from './animated';
import { buildJoinArgs, joinTarget } from './split-join';
import type { Span } from './blur';

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

/**
 * Does this input carry an audio track?
 *
 * It has to be asked, because `concat` cannot take a stream that is not there:
 * building an audio branch for a GIF or a silent clip does not degrade, it
 * fails the whole encode. Running ffmpeg with no output is the cheap way to
 * ask — it prints the stream table, then exits complaining, having decoded
 * nothing.
 */
async function probeLines(ff: FFmpeg, name: string): Promise<string[]> {
  const lines: string[] = [];
  logCb = (line) => lines.push(line);
  try {
    await ff.exec(['-i', name]);
  } catch {
    // No output file is an error by design; the stream table is already read.
  } finally {
    logCb = null;
  }
  return lines;
}

async function probeStreams(ff: FFmpeg, name: string) {
  return streamsFrom(await probeLines(ff, name));
}

async function probeAudio(ff: FFmpeg, name: string): Promise<boolean> {
  return (await probeStreams(ff, name)).audioCodec !== null;
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

/** An annotation already painted to a transparent PNG, and where it goes. */
export interface PaintedLayer extends Span {
  bytes: Uint8Array;
  x: number;
  y: number;
}

export interface AnnotateOptions {
  /** Source duration in seconds, which is also how long the export is. */
  duration: number;
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/**
 * Lay painted annotations over `file` and return MP4 bytes.
 *
 * The painting happened in the page, so the engine only composites: the
 * layers go into its filesystem next to the video and are overlaid in order.
 */
export async function annotateVideo(
  file: File,
  layers: readonly PaintedLayer[],
  opts: AnnotateOptions,
): Promise<Uint8Array> {
  if (layers.length === 0) throw new Error('Nothing is drawn on the video yet.');
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `annotate-input${ext}`;
  const outName = 'annotate-output.mp4';
  const layerNames = layers.map((_, i) => `annotate-layer-${i}.png`);
  try {
    await ff.writeFile(inName, await fetchFile(file));
    for (let i = 0; i < layers.length; i++) await ff.writeFile(layerNames[i]!, layers[i]!.bytes);
    const hasAudio = await probeAudio(ff, inName);

    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || opts.duration <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / opts.duration)));
    };
    await run(
      ff,
      buildAnnotateArgs(
        layers.map((l, i) => ({ name: layerNames[i]!, x: l.x, y: l.y, start: l.start, end: l.end })),
        { input: inName, output: outName, hasAudio, duration: opts.duration },
      ),
    );
    logCb = null;

    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The annotated video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    for (const name of [inName, outName, ...layerNames]) await ff.deleteFile(name).catch(() => {});
  }
}

export interface ReframeOptions {
  mode: ReframeMode;
  /** Target width divided by height. */
  ratio: number;
  /** 0..1 along the axis the crop window can move; ignored when fitting. */
  pan: number;
  frame: Frame;
  /** Source duration in seconds, which is also how long the export is. */
  duration: number;
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/** Crop `file` to a new shape, or fit it over a blurred copy of itself. Returns MP4 bytes. */
export async function reframeVideo(file: File, opts: ReframeOptions): Promise<Uint8Array> {
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `reframe-input${ext}`;
  const outName = 'reframe-output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const hasAudio = await probeAudio(ff, inName);
    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || opts.duration <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / opts.duration)));
    };
    await run(
      ff,
      buildReframeArgs({
        mode: opts.mode,
        input: inName,
        output: outName,
        hasAudio,
        frame: opts.frame,
        ratio: opts.ratio,
        pan: opts.pan,
      }),
    );
    logCb = null;
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The reframed video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface SpeedOptions {
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before encoding starts. */
  onReady?: () => void;
}

/**
 * Re-time `file` piece by piece and return MP4 bytes.
 *
 * Progress is measured against the output's length, not the source's, because
 * `time=` counts output time and a sped-up clip ends early.
 */
export async function speedVideo(
  file: File,
  pieces: readonly Piece[],
  opts: SpeedOptions = {},
): Promise<Uint8Array> {
  const expected = outputDuration(pieces);
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `speed-input${ext}`;
  const outName = 'speed-output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const lines = await probeLines(ff, inName);
    const args = buildSpeedArgs(pieces, {
      input: inName,
      output: outName,
      hasAudio: streamsFrom(lines).audioCodec !== null,
      fps: frameRateFrom(lines),
    });
    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || expected <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / expected)));
    };
    await run(ff, args);
    logCb = null;
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface AnimatedOptions {
  format: AnimatedFormat;
  budgetBytes: number;
  start: number;
  duration: number;
  /** The source's dimensions, which the page already has from its preview. */
  frame: Frame;
  /** 0..1 progress of the current encode. */
  onProgress?: (fraction: number) => void;
  /** Called before each encode, with its number starting at 1. */
  onEncode?: (attempt: number) => void;
  onReady?: () => void;
}

/** Cut a stretch into a GIF or animated WebP that fits the budget, if it can. */
export async function animateVideo(file: File, opts: AnimatedOptions): Promise<FitResult> {
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `animated-input${ext}`;
  const outName = `animated-output.${opts.format}`;
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const clip = { ...opts.frame, fps: frameRateFrom(await probeLines(ff, inName)), duration: opts.duration };
    let attempt = 0;
    return await fitAnimated({
      clip,
      format: opts.format,
      budgetBytes: opts.budgetBytes,
      encode: async (settings) => {
        attempt += 1;
        opts.onEncode?.(attempt);
        opts.onProgress?.(0);
        logCb = (line) => {
          const at = TIME_LINE.exec(line);
          if (!at || !opts.onProgress || opts.duration <= 0) return;
          const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
          opts.onProgress(Math.min(1, Math.max(0, seconds / opts.duration)));
        };
        await run(ff, buildAnimatedArgs({ input: inName, output: outName, format: opts.format, start: opts.start, duration: opts.duration, settings }));
        logCb = null;
        const data = (await ff.readFile(outName)) as Uint8Array;
        if (data.byteLength === 0) throw new Error('The animation came back empty.');
        // A copy, because the next encode overwrites the file this view reads.
        return data.slice();
      },
    });
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface SplitOptions {
  /** 0..1 progress across all parts. */
  onProgress?: (fraction: number) => void;
  /** Called before each part is encoded, with its index from 0. */
  onPart?: (index: number) => void;
  onReady?: () => void;
}

/** Encode each range as its own MP4, reading the source file only once. */
export async function splitVideo(
  file: File,
  parts: readonly Segment[],
  opts: SplitOptions = {},
): Promise<Uint8Array[]> {
  const total = totalDuration(parts);
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `split-input${ext}`;
  const outName = 'split-part.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const hasAudio = await probeAudio(ff, inName);
    const outputs: Uint8Array[] = [];
    let done = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      opts.onPart?.(i);
      logCb = (line) => {
        const at = TIME_LINE.exec(line);
        if (!at || !opts.onProgress || total <= 0) return;
        const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
        opts.onProgress(Math.min(1, (done + Math.min(seconds, part.end - part.start)) / total));
      };
      await run(ff, buildTrimArgs([part], { input: inName, output: outName, hasAudio }));
      logCb = null;
      const data = (await ff.readFile(outName)) as Uint8Array;
      if (data.byteLength === 0) throw new Error(`Part ${i + 1} came back empty.`);
      // A copy: the next part overwrites the file this view reads.
      outputs.push(data.slice());
      await ff.deleteFile(outName).catch(() => {});
      done += part.end - part.start;
    }
    return outputs;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface JoinOptions {
  /** Each clip's size and length, in order, from the page's own preview. */
  clips: readonly { width: number; height: number; duration: number }[];
  /** 0..1 encode progress. */
  onProgress?: (fraction: number) => void;
  onReady?: () => void;
}

/** Join `files` in order into one MP4 the size of the first. */
export async function joinVideos(files: readonly File[], opts: JoinOptions): Promise<Uint8Array> {
  if (files.length < 2) throw new Error('Choose at least two videos to join.');
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();

  const names = files.map((f, i) => `join-input-${i}${f.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4'}`);
  const outName = 'join-output.mp4';
  const expected = opts.clips.reduce((sum, c) => sum + c.duration, 0);
  try {
    const probed: { hasAudio: boolean; fps: number | null }[] = [];
    for (let i = 0; i < files.length; i++) {
      await ff.writeFile(names[i]!, await fetchFile(files[i]!));
      const lines = await probeLines(ff, names[i]!);
      probed.push({ hasAudio: streamsFrom(lines).audioCodec !== null, fps: frameRateFrom(lines) });
    }
    const target = joinTarget(opts.clips.map((c, i) => ({ ...c, fps: probed[i]!.fps })));
    const args = buildJoinArgs(
      opts.clips.map((c, i) => ({ input: names[i]!, hasAudio: probed[i]!.hasAudio, duration: c.duration })),
      target,
      outName,
    );
    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || expected <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, seconds / expected));
    };
    await run(ff, args);
    logCb = null;
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The joined video came back empty.');
    return data;
  } catch (e) {
    throw toError(e);
  } finally {
    logCb = null;
    for (const n of names) await ff.deleteFile(n).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

export interface CopyJobOptions {
  /** Source duration in seconds, for progress. */
  duration: number;
  /** 0..1 progress. */
  onProgress?: (fraction: number) => void;
  /** Called once the (large) core has loaded, before the work starts. */
  onReady?: () => void;
}

/** Why a mute or extract cannot run, in terms the page can show. */
export class NothingToDoError extends Error {
  constructor(readonly reason: 'no-audio' | 'no-video') {
    super(reason === 'no-audio' ? 'This file has no sound.' : 'This file has no picture.');
  }
}

async function copyJob(
  file: File,
  opts: CopyJobOptions,
  outName: string,
  build: (input: string, streams: ReturnType<typeof streamsFrom>) => string[],
): Promise<Uint8Array> {
  const ff = await load().catch((e: unknown) => {
    throw toError(e);
  });
  opts.onReady?.();
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `copy-input${ext}`;
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const streams = await probeStreams(ff, inName);
    const args = build(inName, streams);
    logCb = (line) => {
      const at = TIME_LINE.exec(line);
      if (!at || !opts.onProgress || opts.duration <= 0) return;
      const seconds = Number(at[1]) * 3600 + Number(at[2]) * 60 + Number(at[3]);
      opts.onProgress(Math.min(1, Math.max(0, seconds / opts.duration)));
    };
    await run(ff, args);
    logCb = null;
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (data.byteLength === 0) throw new Error('The result came back empty.');
    return data;
  } catch (e) {
    if (e instanceof NothingToDoError) throw e;
    throw toError(e);
  } finally {
    logCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

/**
 * Drop every audio track, copying the picture untouched. `ext` is the output
 * container, which should be the source's own (see ./audio `containerFor`).
 */
export function muteVideo(file: File, ext: string, opts: CopyJobOptions): Promise<Uint8Array> {
  const outName = `muted-output.${ext}`;
  return copyJob(file, opts, outName, (input, streams) => {
    if (!streams.hasVideo) throw new NothingToDoError('no-video');
    return buildMuteArgs({ input, output: outName });
  });
}

/** Keep only the first audio track, copied when it already is `format`. */
export function extractAudio(file: File, format: AudioFormat, opts: CopyJobOptions): Promise<Uint8Array> {
  const outName = `extract-output.${format}`;
  return copyJob(file, opts, outName, (input, streams) => {
    if (streams.audioCodec === null) throw new NothingToDoError('no-audio');
    return buildExtractArgs({ input, output: outName, format, sourceCodec: streams.audioCodec });
  });
}
