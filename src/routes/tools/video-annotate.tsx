import { createSignal, createMemo, createEffect, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoAnnotatePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import type { Point } from '@core/redact/regions';
import { formatTimecode, parseTimecode } from '@core/video/trim';
import { withStart, withEnd } from '@core/video/blur';
import {
  COLOURS,
  isUsable,
  type Annotation,
  type AnnotationKind,
  type ColourName,
  type TextSize,
} from '@core/video/annotate';
import { drawFrame, renderLayer } from '@core/video/annotate-paint';
import { annotateVideo, type PaintedLayer } from '@core/video/ffmpeg';

/**
 * Add text, arrows, boxes and callouts to a video.
 *
 * Annotations are drawn by the browser, not by the engine: the preview canvas
 * over the player and the PNGs handed to ffmpeg come from the same drawing
 * function, so the export looks like the preview. The engine only lays the
 * images over the frames for the span each one covers.
 */

interface Source {
  url: string;
  duration: number;
  width: number;
  height: number;
  bytes: number;
  name: string;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function readVideoInfo(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const info = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
      URL.revokeObjectURL(v.src);
      Number.isFinite(info.duration) && info.duration > 0 && info.width > 0 && info.height > 0
        ? resolve(info)
        : reject(new Error('no picture'));
    };
    v.onerror = () => reject(new Error('cannot read video'));
    v.src = URL.createObjectURL(file);
  });
}

const KINDS: readonly AnnotationKind[] = ['text', 'arrow', 'rect', 'ellipse', 'callout'];
const hasText = (k: AnnotationKind) => k === 'text' || k === 'callout';

export default function VideoAnnotate() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-annotate'];
  const u = tt.ui;
  useSeo('video-annotate');

  const kindName: Record<AnnotationKind, string> = {
    text: u.toolText,
    arrow: u.toolArrow,
    rect: u.toolRect,
    ellipse: u.toolEllipse,
    callout: u.toolCallout,
  };
  const colourName: Record<ColourName, string> = {
    yellow: u.colourYellow,
    red: u.colourRed,
    green: u.colourGreen,
    blue: u.colourBlue,
    white: u.colourWhite,
    black: u.colourBlack,
  };
  const sizeName: Record<TextSize, string> = { s: u.sizeS, m: u.sizeM, l: u.sizeL };

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [items, setItems] = createSignal<Annotation[]>([]);
  const [tool, setTool] = createSignal<AnnotationKind>('text');
  const [drag, setDrag] = createSignal<{ start: Point; current: Point } | null>(null);
  const [playhead, setPlayhead] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [result, setResult] = createSignal<{ bytes: number; url: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let surface: HTMLDivElement | undefined;
  let video: HTMLVideoElement | undefined;
  let canvas: HTMLCanvasElement | undefined;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-annotate'], detectCapabilities()).supported),
  );

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  const cleanup = () => {
    const s = source();
    if (s) URL.revokeObjectURL(s.url);
    clearResult();
  };
  onCleanup(cleanup);
  // A new version waits rather than reloading a clip and its annotations away.
  useHoldWorkWhile(() => source() !== null);

  const duration = () => source()?.duration ?? 0;
  const usable = createMemo(() => items().filter(isUsable));
  const itemsLabel = (n: number) => (n === 1 ? u.itemsOne : fmt(u.itemsMany, { n }));

  /** The annotation a drag in progress would make, so it is visible while drawn. */
  const draft = (start: Point, end: Point): Annotation => ({
    kind: tool(),
    a: start,
    b: end,
    text: u.defaultText,
    colour: 'yellow',
    size: 'm',
    start: 0,
    end: duration(),
  });

  // Redraw the preview whenever what it shows could have changed.
  createEffect(() => {
    const s = source();
    const d = drag();
    const list = items();
    const at = playhead();
    const ctx = canvas?.getContext('2d');
    if (!s || !ctx) return;
    const shown = d ? [...list, { ...draft(d.start, d.current), start: at, end: at + 1 }] : list;
    drawFrame(ctx, shown, { width: s.width, height: s.height }, at);
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setSource(null);
    setItems([]);
    setStatus('');
    setError('');
    setProgress(0);
    setPlayhead(0);
    setPlaying(false);
    file = f;
    try {
      const info = await readVideoInfo(f);
      setSource({ url: URL.createObjectURL(f), ...info, bytes: f.size, name: f.name });
    } catch {
      file = null;
      setError(u.readError);
    }
  }

  const commit = (next: Annotation[]) => {
    clearResult();
    setError('');
    setStatus('');
    setItems(next);
  };
  const update = (i: number, patch: Partial<Annotation>) =>
    commit(items().map((it, j) => (j === i ? { ...it, ...patch } : it)));

  /** Measured against the video, not the surface, whose border would offset every point. */
  const pointFrom = (e: PointerEvent): Point => {
    const box = (video ?? surface!).getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  };

  function onPointerDown(e: PointerEvent) {
    if (!source() || busy()) return;
    e.preventDefault();
    video?.pause();
    surface!.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    setDrag({ start: p, current: p });
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag();
    if (d) setDrag({ start: d.start, current: pointFrom(e) });
  }

  function onPointerUp() {
    const d = drag();
    setDrag(null);
    if (!d) return;
    const made = draft(d.start, d.current);
    // A click places text; every other kind needs a drag to mean anything.
    if (!hasText(made.kind) && !isUsable(made)) return;
    commit([...items(), made]);
    if (hasText(made.kind)) {
      queueMicrotask(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('input[data-annotation-text]');
        inputs[inputs.length - 1]?.select();
      });
    }
  }

  function setEdge(i: number, which: 'start' | 'end', text: string) {
    const parsed = parseTimecode(text);
    const it = items()[i];
    if (parsed === null || !it) return;
    commit(
      items().map((x, j) =>
        j === i ? (which === 'start' ? withStart(it, parsed, duration()) : withEnd(it, parsed, duration())) : x,
      ),
    );
  }

  const seek = (to: number) => {
    setPlayhead(to);
    if (video) video.currentTime = to;
  };

  const togglePlay = () => {
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  async function run() {
    const s = source();
    if (!file || !s) return;
    if (usable().length === 0) {
      setError(u.needItem);
      return;
    }
    video?.pause();
    clearResult();
    setError('');
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const frame = { width: s.width, height: s.height };
      const layers: PaintedLayer[] = [];
      for (const a of usable()) {
        const { bytes, rect } = await renderLayer(a, frame);
        layers.push({ bytes, x: rect.x, y: rect.y, start: a.start, end: a.end });
      }
      const out = await annotateVideo(file, layers, {
        duration: s.duration,
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url });
      setStatus(fmt(u.doneStatus, { items: itemsLabel(layers.length), size: size(out.byteLength) }));
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const smallButton =
    'cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40';
  const field = 'rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} tool="video-annotate" preview={VideoAnnotatePreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={
          <p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">
            {u.unsupported}
          </p>
        }
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="annotate-file">
              {u.pickLabel}
            </label>
            <input
              id="annotate-file"
              type="file"
              accept="video/*"
              onChange={(e) => void onPick(e)}
              disabled={busy()}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={source()}>
              {(s) => (
                <p class="mt-2 text-xs text-muted">
                  {fmt(u.fileMeta, {
                    name: s().name,
                    size: size(s().bytes),
                    duration: formatTimecode(s().duration),
                  })}
                </p>
              )}
            </Show>
          </div>

          <Show when={source()}>
            {(s) => (
              <>
                <fieldset>
                  <legend class="mb-2 text-sm font-medium">{u.toolLabel}</legend>
                  <div class="flex flex-wrap gap-4">
                    <For each={KINDS}>
                      {(k) => (
                        <label class="flex items-center gap-2 text-sm text-fg">
                          <input
                            type="radio"
                            name="annotate-tool"
                            value={k}
                            checked={tool() === k}
                            onChange={() => setTool(k)}
                          />
                          {kindName[k]}
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>

                <div>
                  <p class="mb-2 text-sm font-medium">{u.drawHeading}</p>
                  <p class="mb-3 text-xs text-muted">{u.drawHint}</p>

                  {/* Shrink-wrapped to the video, never letterboxed: points are fractions
                    of the picture, so bars around it would shift everything drawn. */}
                  <div
                    ref={surface}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    class="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded border border-border"
                  >
                    <video
                      ref={video}
                      src={s().url}
                      playsinline
                      preload="auto"
                      onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onEnded={() => setPlaying(false)}
                      class="pointer-events-none block h-auto max-h-96 w-auto max-w-full"
                    />
                    {/* The video's own resolution, scaled by CSS: drawing in frame pixels is
                      what makes this the same picture the export paints. */}
                    <canvas
                      ref={canvas}
                      width={s().width}
                      height={s().height}
                      data-annotation-preview
                      class="pointer-events-none absolute inset-0 h-full w-full"
                    />
                  </div>

                  <div class="mt-3 flex items-center gap-3">
                    <button type="button" onClick={togglePlay} disabled={busy()} class={smallButton}>
                      {playing() ? u.pause : u.play}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={s().duration}
                      step="0.01"
                      value={playhead()}
                      aria-label={u.scrubLabel}
                      aria-valuetext={formatTimecode(playhead())}
                      onInput={(e) => seek(Number(e.currentTarget.value))}
                      class="min-w-0 flex-1"
                    />
                    <span class="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
                      {formatTimecode(playhead())}
                    </span>
                  </div>
                </div>

                <div>
                  <p class="mb-2 text-sm font-medium">{u.listHeading}</p>
                  <Show when={items().length > 0} fallback={<p class="text-xs text-muted">{u.noItems}</p>}>
                    <ol class="space-y-3">
                      <For each={items()}>
                        {(it, i) => (
                          <li class="space-y-3 rounded border border-border bg-surface p-3">
                            <div class="flex flex-wrap items-end gap-3">
                              <span class="self-center text-sm font-medium">
                                {fmt(u.itemName, { kind: kindName[it.kind], n: i() + 1 })}
                              </span>
                              <Show when={hasText(it.kind)}>
                                <div class="min-w-0 flex-1">
                                  <label class="mb-1 block text-xs font-medium" for={`annotate-text-${i()}`}>
                                    {u.textLabel}
                                  </label>
                                  <input
                                    id={`annotate-text-${i()}`}
                                    data-annotation-text
                                    type="text"
                                    value={it.text}
                                    onInput={(e) => update(i(), { text: e.currentTarget.value })}
                                    class={`${field} w-full`}
                                  />
                                </div>
                              </Show>
                              <div>
                                <label class="mb-1 block text-xs font-medium" for={`annotate-colour-${i()}`}>
                                  {u.colourLabel}
                                </label>
                                <select
                                  id={`annotate-colour-${i()}`}
                                  value={it.colour}
                                  onChange={(e) => update(i(), { colour: e.currentTarget.value as ColourName })}
                                  class={field}
                                >
                                  <For each={Object.keys(COLOURS) as ColourName[]}>
                                    {(c) => <option value={c}>{colourName[c]}</option>}
                                  </For>
                                </select>
                              </div>
                              <Show when={hasText(it.kind)}>
                                <div>
                                  <label class="mb-1 block text-xs font-medium" for={`annotate-size-${i()}`}>
                                    {u.sizeLabel}
                                  </label>
                                  <select
                                    id={`annotate-size-${i()}`}
                                    value={it.size}
                                    onChange={(e) => update(i(), { size: e.currentTarget.value as TextSize })}
                                    class={field}
                                  >
                                    <For each={['s', 'm', 'l'] as TextSize[]}>
                                      {(z) => <option value={z}>{sizeName[z]}</option>}
                                    </For>
                                  </select>
                                </div>
                              </Show>
                            </div>
                            <div class="flex flex-wrap items-end gap-3">
                              <div>
                                <label class="mb-1 block text-xs font-medium" for={`annotate-start-${i()}`}>
                                  {u.startLabel}
                                </label>
                                <input
                                  id={`annotate-start-${i()}`}
                                  type="text"
                                  inputmode="decimal"
                                  value={formatTimecode(it.start)}
                                  onChange={(e) => setEdge(i(), 'start', e.currentTarget.value)}
                                  class={`${field} w-24`}
                                />
                              </div>
                              <div>
                                <label class="mb-1 block text-xs font-medium" for={`annotate-end-${i()}`}>
                                  {u.endLabel}
                                </label>
                                <input
                                  id={`annotate-end-${i()}`}
                                  type="text"
                                  inputmode="decimal"
                                  value={formatTimecode(it.end)}
                                  onChange={(e) => setEdge(i(), 'end', e.currentTarget.value)}
                                  class={`${field} w-24`}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busy()}
                                class={smallButton}
                                onClick={() =>
                                  commit(items().map((x, j) => (j === i() ? withStart(x, playhead(), duration()) : x)))
                                }
                              >
                                {u.startHere}
                              </button>
                              <button
                                type="button"
                                disabled={busy()}
                                class={smallButton}
                                onClick={() =>
                                  commit(items().map((x, j) => (j === i() ? withEnd(x, playhead(), duration()) : x)))
                                }
                              >
                                {u.endHere}
                              </button>
                              <button
                                type="button"
                                disabled={busy()}
                                class={smallButton}
                                onClick={() => commit(items().filter((_, j) => j !== i()))}
                              >
                                {u.remove}
                              </button>
                            </div>
                          </li>
                        )}
                      </For>
                    </ol>
                    <div class="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => commit(items().slice(0, -1))}
                        disabled={busy()}
                        class={smallButton}
                      >
                        {u.undo}
                      </button>
                      <button type="button" onClick={() => commit([])} disabled={busy()} class={smallButton}>
                        {u.clear}
                      </button>
                    </div>
                  </Show>
                </div>

                <p class="rounded border border-border bg-surface p-3 text-sm text-muted">{u.timeNote}</p>

                <Button onClick={() => void run()} disabled={busy() || usable().length === 0}>
                  {busy() ? u.working : u.action}
                </Button>
              </>
            )}
          </Show>

          <Show when={error()}>
            <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
          </Show>

          <Show when={busy() && progress() > 0}>
            <div class="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div class="h-full bg-accent transition-all" style={{ width: `${Math.round(progress() * 100)}%` }} />
            </div>
          </Show>

          <Show when={status()}>
            <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
              {status()}
            </p>
          </Show>

          <Show when={result()}>
            {(r) => (
              <div class="space-y-3">
                <a
                  href={r().url}
                  download={`annotated-${(source()?.name ?? 'video').replace(/\.[a-z0-9]+$/i, '')}.mp4`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: size(r().bytes) })}
                </a>
                <video src={r().url} controls class="max-h-80 w-full rounded border border-border" />
                <p class="text-xs text-muted">{u.verifyHint}</p>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-annotate" />
    </main>
  );
}
