import { createSignal, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoTrimPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import {
  removeRange,
  totalDuration,
  formatTimecode,
  parseTimecode,
  MIN_SEGMENT_SEC,
  type Segment,
} from '@core/video/trim';
import { readGifInfo } from '@core/video/gif';
import { trimVideo } from '@core/video/ffmpeg';

/**
 * Video trimmer.
 *
 * The state is an edit list of kept segments, not a start and an end, so
 * "cut this out" can take a piece from the middle and leave the parts either
 * side joined. Both buttons are the same operation on that list: keeping a
 * range is removing everything outside it. That is also what makes the tool
 * extensible, since a later mute or speed control is another op over the same
 * list rather than a second way of describing an edit.
 *
 * Encoding is ffmpeg.wasm on the device, sharing the core the compressor
 * already loads.
 */

interface Source {
  url: string;
  duration: number;
  /** GIFs take a different preview and a different way of reading duration. */
  isGif: boolean;
  bytes: number;
  name: string;
}

/** Bytes, in the unit that carries information: a trimmed clip is often
 *  well under a megabyte, and "0.0 MB" tells the reader nothing. */
const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * A video's duration, from the browser.
 *
 * The compressor asks the same question its own way; this stays local rather
 * than being hoisted into a shared helper, because the two differ in what they
 * do about a GIF and the shared part would be four lines.
 */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(v.src);
      Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('no duration'));
    };
    v.onerror = () => reject(new Error('cannot read video'));
    v.src = URL.createObjectURL(file);
  });
}

export default function VideoTrim() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-trim'];
  const u = tt.ui;
  useSeo('video-trim');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [keep, setKeep] = createSignal<Segment[]>([]);
  const [history, setHistory] = createSignal<Segment[][]>([]);
  const [sel, setSel] = createSignal<Segment>({ start: 0, end: 0 });
  const [playhead, setPlayhead] = createSignal(0);
  const [dragging, setDragging] = createSignal<'start' | 'end' | null>(null);
  const [result, setResult] = createSignal<{ bytes: number; url: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let bar: HTMLDivElement | undefined;
  let video: HTMLVideoElement | undefined;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-trim'], detectCapabilities()).supported),
  );

  const cleanup = () => {
    const s = source();
    const r = result();
    if (s) URL.revokeObjectURL(s.url);
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(cleanup);

  const duration = () => source()?.duration ?? 0;
  const kept = createMemo(() => totalDuration(keep()));
  const pct = (v: number) => `${duration() > 0 ? (v / duration()) * 100 : 0}%`;

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setResult(null);
    setStatus('');
    setProgress(0);
    setPlayhead(0);
    file = f;
    try {
      const isGif = /^image\/gif$/i.test(f.type) || /\.gif$/i.test(f.name);
      let seconds: number;
      if (isGif) {
        const info = readGifInfo(new Uint8Array(await f.arrayBuffer()));
        if (!info) throw new Error('unreadable gif');
        seconds = info.durationSec;
      } else {
        seconds = await readDuration(f);
      }
      setSource({ url: URL.createObjectURL(f), duration: seconds, isGif, bytes: f.size, name: f.name });
      setKeep([{ start: 0, end: seconds }]);
      setSel({ start: 0, end: seconds });
      setHistory([]);
    } catch {
      setSource(null);
      setKeep([]);
      setStatus(u.readError);
    }
  }

  /** Replace the edit list, keeping the old one for Undo. */
  const commit = (next: Segment[]) => {
    setHistory([...history(), keep()]);
    setKeep(next);
    setResult(null);
    setStatus('');
  };

  const keepOnly = () => {
    const s = sel();
    // Everything before the selection, then everything after it.
    const head = removeRange(keep(), { start: 0, end: s.start });
    commit(removeRange(head, { start: s.end, end: duration() }));
  };

  const cutOut = () => commit(removeRange(keep(), sel()));

  const undo = () => {
    const past = history();
    const previous = past[past.length - 1];
    if (!previous) return;
    setHistory(past.slice(0, -1));
    setKeep(previous);
    setResult(null);
    setStatus('');
  };

  const reset = () => {
    commit([{ start: 0, end: duration() }]);
    setSel({ start: 0, end: duration() });
  };

  const timeAt = (clientX: number) => {
    const box = bar!.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    return Math.min(duration(), Math.max(0, ratio * duration()));
  };

  const seek = (to: number) => {
    setPlayhead(to);
    if (video) video.currentTime = to;
  };

  /**
   * Move one handle, keeping it inside the clip and on its own side of the other.
   *
   * The clamp to the clip belongs here rather than in the callers: dragging is
   * already bounded by the bar's width, but an arrow key at either end is not,
   * and an unclamped handle puts a negative start time into the encoder.
   */
  function moveHandle(which: 'start' | 'end', to: number) {
    const s = sel();
    const at = Math.min(duration(), Math.max(0, to));
    if (which === 'start') setSel({ start: Math.min(at, s.end - MIN_SEGMENT_SEC), end: s.end });
    else setSel({ start: s.start, end: Math.max(at, s.start + MIN_SEGMENT_SEC) });
  }

  function onHandleDown(which: 'start' | 'end', e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(which);
  }

  function onHandleMove(e: PointerEvent) {
    const which = dragging();
    if (!which) return;
    moveHandle(which, timeAt(e.clientX));
  }

  function onHandleKey(which: 'start' | 'end', e: KeyboardEvent) {
    const step = e.shiftKey ? 1 : 0.1;
    const at = which === 'start' ? sel().start : sel().end;
    if (e.key === 'ArrowLeft') moveHandle(which, at - step);
    else if (e.key === 'ArrowRight') moveHandle(which, at + step);
    else if (e.key === 'Home') moveHandle(which, 0);
    else if (e.key === 'End') moveHandle(which, duration());
    else return;
    e.preventDefault();
  }

  function setEdge(which: 'start' | 'end', text: string) {
    const parsed = parseTimecode(text);
    if (parsed === null) return;
    moveHandle(which, parsed);
  }

  async function run() {
    const s = source();
    const list = keep();
    if (!file || !s || list.length === 0) return;
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await trimVideo(file, list, {
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const previous = result();
      if (previous) URL.revokeObjectURL(previous.url);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url });
      setStatus(
        fmt(u.doneStatus, { duration: formatTimecode(totalDuration(list)), size: size(out.byteLength) }),
      );
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  // Handles are drawn in the foreground colour rather than the accent: they sit
  // on top of the accent-filled kept blocks, and accent on accent is invisible.
  const handleClass =
    'absolute top-0 z-20 h-full w-4 -translate-x-1/2 cursor-ew-resize touch-none rounded ' +
    'border border-bg bg-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoTrimPreview}>
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
            <label class="mb-2 block text-sm font-medium" for="trim-file">
              {u.pickLabel}
            </label>
            <input
              id="trim-file"
              type="file"
              accept="video/*,image/gif"
              onChange={(e) => void onPick(e)}
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
                <Show
                  when={!s().isGif}
                  fallback={
                    <div class="space-y-2">
                      <img
                        src={s().url}
                        alt=""
                        class="max-h-80 w-full rounded border border-border object-contain"
                      />
                      <p class="text-xs text-muted">{u.gifNote}</p>
                    </div>
                  }
                >
                  <video
                    ref={video}
                    src={s().url}
                    controls
                    onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                    class="max-h-80 w-full rounded border border-border"
                  />
                </Show>

                <div>
                  <p class="mb-2 text-sm font-medium">{u.timelineLabel}</p>
                  {/* Padded so a handle at 0 or at the very end is not clipped. */}
                  <div class="px-2">
                    <div
                      ref={bar}
                      onPointerDown={(e) => !s().isGif && seek(timeAt(e.clientX))}
                      class="relative h-16 w-full touch-none rounded border border-border bg-surface"
                    >
                      {/* Clipped layer: the bar's own surface is what got cut. */}
                      <div class="absolute inset-0 overflow-hidden rounded">
                        <For each={keep()}>
                          {(k) => (
                            <div
                              class="absolute inset-y-0 bg-accent"
                              style={{ left: pct(k.start), width: pct(k.end - k.start) }}
                            />
                          )}
                        </For>

                        {/* Outlined, never filled: a fill would hide the kept/cut state under it,
                          and these palette tokens are opaque hex vars, so there is no
                          translucent fill available anyway (see uno.config.ts). */}
                        <div
                          class="absolute inset-y-0 z-10 rounded-sm border-2 border-fg"
                          style={{ left: pct(sel().start), width: pct(sel().end - sel().start) }}
                        />

                        <Show when={!s().isGif}>
                          <div
                            class="absolute inset-y-0 z-10 w-0.5 bg-fg"
                            style={{ left: pct(playhead()) }}
                          />
                        </Show>
                      </div>

                      <div
                        role="slider"
                        tabindex="0"
                        aria-label={u.handleStart}
                        aria-valuemin={0}
                        aria-valuemax={s().duration}
                        aria-valuenow={sel().start}
                        aria-valuetext={formatTimecode(sel().start)}
                        class={handleClass}
                        style={{ left: pct(sel().start) }}
                        onPointerDown={(e) => onHandleDown('start', e)}
                        onPointerMove={onHandleMove}
                        onPointerUp={() => setDragging(null)}
                        onKeyDown={(e) => onHandleKey('start', e)}
                      />
                      <div
                        role="slider"
                        tabindex="0"
                        aria-label={u.handleEnd}
                        aria-valuemin={0}
                        aria-valuemax={s().duration}
                        aria-valuenow={sel().end}
                        aria-valuetext={formatTimecode(sel().end)}
                        class={handleClass}
                        style={{ left: pct(sel().end) }}
                        onPointerDown={(e) => onHandleDown('end', e)}
                        onPointerMove={onHandleMove}
                        onPointerUp={() => setDragging(null)}
                        onKeyDown={(e) => onHandleKey('end', e)}
                      />
                    </div>
                  </div>
                  <p class="mt-2 text-xs text-muted">{u.timelineHelp}</p>
                </div>

                <div class="flex flex-wrap items-end gap-4">
                  <div>
                    <label class="mb-1 block text-xs font-medium" for="trim-start">
                      {u.startLabel}
                    </label>
                    <input
                      id="trim-start"
                      type="text"
                      inputmode="decimal"
                      value={formatTimecode(sel().start)}
                      onChange={(e) => setEdge('start', e.currentTarget.value)}
                      class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium" for="trim-end">
                      {u.endLabel}
                    </label>
                    <input
                      id="trim-end"
                      type="text"
                      inputmode="decimal"
                      value={formatTimecode(sel().end)}
                      onChange={(e) => setEdge('end', e.currentTarget.value)}
                      class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </div>
                </div>

                <div class="flex flex-wrap gap-3">
                  <Button onClick={keepOnly} disabled={busy()}>
                    {u.keepOnly}
                  </Button>
                  <Button variant="secondary" onClick={cutOut} disabled={busy()}>
                    {u.cutOut}
                  </Button>
                  <Button variant="ghost" onClick={undo} disabled={busy() || history().length === 0}>
                    {u.undo}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy()}>
                    {u.reset}
                  </Button>
                </div>

                <p class="text-sm text-fg">
                  {fmt(u.outputInfo, {
                    kept: formatTimecode(kept()),
                    total: formatTimecode(s().duration),
                  })}
                  <Show when={keep().length > 1}>
                    <span class="text-muted">
                      {' '}
                      {fmt(u.piecesInfo, { count: String(keep().length) })}
                    </span>
                  </Show>
                </p>

                <Show when={keep().length === 0}>
                  <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
                    {u.nothingKept}
                  </p>
                </Show>

                <Button onClick={() => void run()} disabled={busy() || keep().length === 0}>
                  {busy() ? u.working : u.action}
                </Button>
              </>
            )}
          </Show>

          <Show when={busy() && progress() > 0}>
            <div class="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                class="h-full bg-accent transition-all"
                style={{ width: `${Math.round(progress() * 100)}%` }}
              />
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
                  download={`trimmed-${(source()?.name ?? 'video').replace(/\.[a-z0-9]+$/i, '')}.mp4`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: size(r().bytes) })}
                </a>
                <video src={r().url} controls class="max-h-80 w-full rounded border border-border" />
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-trim" />
    </main>
  );
}
