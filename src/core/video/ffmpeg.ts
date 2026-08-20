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
  const ff = await load();
  opts.onReady?.();

  progressCb = opts.onProgress ?? null;
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4';
  const inName = `input${ext}`;
  const outName = 'output.mp4';
  try {
    await ff.writeFile(inName, await fetchFile(file));
    await ff.exec([
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
  } finally {
    progressCb = null;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}
