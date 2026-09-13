import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoFramePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode } from '@core/video/trim';
import {
  FRAME_FORMATS,
  frameFileName,
  findNeighbourFrame,
  framesDiffer,
  type FrameFormat,
} from '@core/video/frame';

/**
 * Save a frame of a video as an image.
 *
 * No video engine: the browser has already decoded the frame on screen, and a
 * canvas at the video's own size takes it at full resolution. The only thing
 * this costs is that a video the browser cannot play cannot be read either, and
 * the page says so rather than showing a blank player.
 */

interface Source {
  url: string;
  name: string;
  bytes: number;
}

/** Kept apart from `Source`: updating the object that holds the URL re-applies
 *  `src`, and setting `src` reloads a video even to the same URL, which fires
 *  loadeddata again, in a loop. */
interface Meta {
  duration: number;
  width: number;
  height: number;
}

interface Grab {
  url: string;
  name: string;
  at: number;
  bytes: number;
}

/** Small enough to compare in a blink, big enough that a real change shows. */
const SAMPLE_W = 64;
const SAMPLE_H = 36;

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Seconds with milliseconds, because two frames a thirtieth of a second apart need telling apart. */
const stamp = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const minutes = Math.floor(ms / 60000);
  return `${String(minutes).padStart(2, '0')}:${((ms - minutes * 60000) / 1000).toFixed(3).padStart(6, '0')}`;
};

export default function VideoFrame() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-frame'];
  const u = tt.ui;
  useSeo('video-frame');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [meta, setMeta] = createSignal<Meta | null>(null);
  const [error, setError] = createSignal('');
  const [time, setTime] = createSignal(0);
  const [format, setFormat] = createSignal<FrameFormat>('png');
  const [grabs, setGrabs] = createSignal<Grab[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [note, setNote] = createSignal('');
  const canCopy = typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write;

  let video: HTMLVideoElement | undefined;
  let sampleCtx: CanvasRenderingContext2D | null = null;

  onMount(() => setSupported(evaluate(TOOL_CAPABILITIES['video-frame'], detectCapabilities()).supported));

  const revokeAll = () => {
    const s = source();
    if (s) URL.revokeObjectURL(s.url);
    for (const g of grabs()) URL.revokeObjectURL(g.url);
  };
  onCleanup(revokeAll);
  useHoldWorkWhile(() => grabs().length > 0);

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    revokeAll();
    setGrabs([]);
    setError('');
    setNote('');
    setTime(0);
    setMeta(null);
    setSource({ url: URL.createObjectURL(f), name: f.name, bytes: f.size });
  }

  function onLoaded() {
    if (!video) return;
    if (!video.videoWidth || !Number.isFinite(video.duration)) {
      setError(u.cannotPlay);
      return;
    }
    setMeta({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
  }

  /**
   * Seek and wait for it to land.
   *
   * Setting the time already there starts no seek and so fires no `seeked`,
   * which would leave a step waiting forever; that case returns at once, and a
   * timeout covers any other event that never arrives.
   */
  const seekTo = (at: number) =>
    new Promise<void>((resolve) => {
      if (!video || Math.abs(video.currentTime - at) < 1e-6) return resolve();
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        video?.removeEventListener('seeked', done);
        resolve();
      }, 1000);
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = at;
    });

  const pixels = () => {
    if (!sampleCtx) {
      const sample = document.createElement('canvas');
      sample.width = SAMPLE_W;
      sample.height = SAMPLE_H;
      sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    }
    sampleCtx!.drawImage(video!, 0, 0, SAMPLE_W, SAMPLE_H);
    return sampleCtx!.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  };

  /** Move to the neighbouring frame (see ../core/video/frame). */
  async function step(direction: 1 | -1) {
    const s = meta();
    if (!video || !s || busy()) return;
    setBusy(true);
    video.pause();
    try {
      const from = video.currentTime;
      const before = pixels();
      const target = await findNeighbourFrame(from, direction, s.duration, async (at) => {
        await seekTo(at);
        return framesDiffer(before, pixels());
      });
      // No neighbour: back to where the step started rather than a probe's end.
      if (target === null) await seekTo(from);
      else if (video.currentTime !== target) await seekTo(target);
      setTime(video.currentTime);
    } finally {
      setBusy(false);
    }
  }

  async function capture(mime: string, quality: number | undefined): Promise<Blob> {
    const s = meta()!;
    const canvas = document.createElement('canvas');
    canvas.width = s.width;
    canvas.height = s.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(video!, 0, 0, s.width, s.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error('Image encode failed');
    return blob;
  }

  async function save() {
    const s = source();
    const dims = meta();
    if (!video || !s || !dims) return;
    video.pause();
    setNote('');
    try {
      const at = video.currentTime;
      const spec = FRAME_FORMATS[format()];
      const blob = await capture(spec.mime, spec.quality);
      const grab: Grab = {
        url: URL.createObjectURL(blob),
        name: frameFileName(s.name, at, FRAME_FORMATS[format()].ext),
        at,
        bytes: blob.size,
      };
      setGrabs([grab, ...grabs()]);
      setNote(fmt(u.saved, { time: stamp(at), width: String(dims.width), height: String(dims.height) }));
    } catch {
      setNote(u.saveFailed);
    }
  }

  async function copy() {
    if (!video || !meta()) return;
    video.pause();
    const at = video.currentTime;
    try {
      // PNG, because clipboards refuse JPEG almost everywhere. The item gets the
      // pending image rather than the finished one: Safari only allows a write
      // that starts inside the click, before any await.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': capture('image/png', undefined) })]);
      setNote(fmt(u.copied, { time: stamp(at) }));
    } catch {
      setNote(u.copyFailed);
    }
  }

  const remove = (g: Grab) => {
    URL.revokeObjectURL(g.url);
    setGrabs(grabs().filter((x) => x !== g));
  };

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    if (e.key === ',') void step(-1);
    else if (e.key === '.') void step(1);
    else return;
    e.preventDefault();
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoFramePreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={<p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">{u.unsupported}</p>}
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="frame-file">
              {u.pickLabel}
            </label>
            <input
              id="frame-file"
              type="file"
              accept="video/*"
              onChange={onPick}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={meta()}>
              <p class="mt-2 text-xs text-muted">
                {fmt(u.fileMeta, {
                  name: source()!.name,
                  size: size(source()!.bytes),
                  duration: formatTimecode(meta()!.duration),
                  width: String(meta()!.width),
                  height: String(meta()!.height),
                })}
              </p>
            </Show>
          </div>

          <Show when={error()}>
            <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg" role="alert">
              {error()}
            </p>
          </Show>

          <Show when={source()}>
            {(s) => (
              <div class="space-y-6" onKeyDown={onKey}>
                <video
                  ref={video}
                  src={s().url}
                  controls
                  preload="auto"
                  onLoadedData={onLoaded}
                  onError={() => setError(u.cannotPlay)}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onSeeked={(e) => setTime(e.currentTarget.currentTime)}
                  class="max-h-96 w-full rounded border border-border bg-fg"
                />

                <Show when={meta()}>
                  <div class="flex flex-wrap items-center gap-3">
                    <Button variant="outline" color="neutral" onClick={() => void step(-1)} disabled={busy()} aria-keyshortcuts=",">
                      {u.previousFrame}
                    </Button>
                    <Button variant="outline" color="neutral" onClick={() => void step(1)} disabled={busy()} aria-keyshortcuts=".">
                      {u.nextFrame}
                    </Button>
                    <span class="font-mono text-sm tabular-nums text-fg" data-frame-time>
                      {stamp(time())}
                    </span>
                  </div>
                  <p class="-mt-4 text-xs text-muted">{u.stepHelp}</p>

                  <fieldset>
                    <legend class="mb-2 text-sm font-medium">{u.formatLabel}</legend>
                    <div class="grid gap-2 sm:grid-cols-2">
                      <For each={['png', 'jpeg'] as const}>
                        {(f) => (
                          <label
                            class={
                              'flex cursor-pointer items-start gap-3 rounded border p-3 ' +
                              (format() === f ? 'border-accent bg-accent-soft' : 'border-border')
                            }
                          >
                            <input
                              type="radio"
                              name="frame-format"
                              class="mt-1"
                              checked={format() === f}
                              onChange={() => setFormat(f)}
                            />
                            <span>
                              <span class="block text-sm font-medium">{f === 'png' ? u.formatPng : u.formatJpeg}</span>
                              <span class="block text-xs text-muted">{f === 'png' ? u.formatPngHint : u.formatJpegHint}</span>
                            </span>
                          </label>
                        )}
                      </For>
                    </div>
                  </fieldset>

                  <div class="flex flex-wrap gap-3">
                    <Button onClick={() => void save()} disabled={busy()}>
                      {u.save}
                    </Button>
                    <Show when={canCopy}>
                      <Button variant="outline" color="neutral" onClick={() => void copy()} disabled={busy()}>
                        {u.copy}
                      </Button>
                    </Show>
                  </div>

                  <Show when={note()}>
                    <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
                      {note()}
                    </p>
                  </Show>
                </Show>
              </div>
            )}
          </Show>

          <Show when={grabs().length > 0}>
            <section class="space-y-3">
              <h2 class="text-sm font-medium">{fmt(u.grabsHeading, { count: String(grabs().length) })}</h2>
              <ul class="grid list-none gap-3 p-0 sm:grid-cols-2">
                <For each={grabs()}>
                  {(g) => (
                    <li class="space-y-2 rounded border border-border p-2">
                      <img src={g.url} alt={fmt(u.grabAlt, { time: stamp(g.at) })} class="h-auto w-full rounded" />
                      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span class="font-mono tabular-nums">
                          {stamp(g.at)} · {size(g.bytes)}
                        </span>
                        <span class="flex gap-2">
                          <a
                            href={g.url}
                            download={g.name}
                            class="inline-flex items-center rounded bg-accent px-3 py-1 text-xs font-medium text-accent-fg no-underline"
                          >
                            {u.download}
                          </a>
                          <Button variant="ghost" size="xs" onClick={() => remove(g)}>
                            {u.remove}
                          </Button>
                        </span>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
        </div>
      </Show>
      <ToolContent route="video-frame" />
    </main>
  );
}
