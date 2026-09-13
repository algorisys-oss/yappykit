import { createSignal, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoSpeedPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode, parseTimecode, MIN_SEGMENT_SEC, type Segment } from '@core/video/trim';
import { setSpeed, outputDuration, speedToFit, MIN_SPEED, MAX_SPEED, type Piece } from '@core/video/speed';
import { outputName } from '@core/video/audio';
import { speedVideo } from '@core/video/ffmpeg';

/**
 * Speed a video up or slow it down, all of it or a part at a time.
 *
 * The selection starts as the whole clip, so the speed buttons change the whole
 * video until the selection is narrowed, and then they change only that part.
 * "Make it last" is the outcome most people actually have, a length a platform
 * allows, and the speed is solved for it.
 *
 * Playing the preview applies each part's speed as the playhead reaches it,
 * with the browser keeping the pitch, which is what the export does too.
 */

const SPEEDS = [0.5, 1, 1.5, 2, 4, 8] as const;

interface Source {
  url: string;
  duration: number;
  bytes: number;
  name: string;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const times = (speed: number) => `${Number(speed.toFixed(2))}×`;

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

export default function VideoSpeed() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-speed'];
  const u = tt.ui;
  useSeo('video-speed');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [pieces, setPieces] = createSignal<Piece[]>([]);
  const [sel, setSel] = createSignal<Segment>({ start: 0, end: 0 });
  const [playhead, setPlayhead] = createSignal(0);
  const [dragging, setDragging] = createSignal<'start' | 'end' | null>(null);
  const [fitText, setFitText] = createSignal('');
  const [fitNote, setFitNote] = createSignal('');
  const [result, setResult] = createSignal<{ bytes: number; url: string; name: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let bar: HTMLDivElement | undefined;
  let video: HTMLVideoElement | undefined;
  let frame = 0;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-speed'], detectCapabilities()).supported),
  );

  const cleanup = () => {
    const s = source();
    const r = result();
    if (s) URL.revokeObjectURL(s.url);
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(() => {
    cancelAnimationFrame(frame);
    cleanup();
  });
  useHoldWorkWhile(() => source() !== null);

  const duration = () => source()?.duration ?? 0;
  const outLength = createMemo(() => outputDuration(pieces()));
  const pct = (v: number) => `${duration() > 0 ? (v / duration()) * 100 : 0}%`;
  const speedAt = (at: number) => pieces().find((p) => at >= p.start && at < p.end)?.speed ?? 1;
  const selSpeed = createMemo(() => {
    const s = sel();
    const inside = pieces().filter((p) => p.end > s.start + 1e-6 && p.start < s.end - 1e-6);
    return inside.length > 0 && inside.every((p) => p.speed === inside[0]!.speed) ? inside[0]!.speed : null;
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setResult(null);
    setStatus('');
    setProgress(0);
    setPlayhead(0);
    setFitNote('');
    file = f;
    try {
      const seconds = await readDuration(f);
      setSource({ url: URL.createObjectURL(f), duration: seconds, bytes: f.size, name: f.name });
      setPieces([{ start: 0, end: seconds, speed: 1 }]);
      setSel({ start: 0, end: seconds });
    } catch {
      setSource(null);
      setPieces([]);
      setStatus(u.readError);
    }
  }

  const change = (next: Piece[]) => {
    setPieces(next);
    setResult(null);
    setStatus('');
  };

  const apply = (speed: number) => {
    setFitNote('');
    change(setSpeed(pieces(), sel(), speed));
  };

  const reset = () => {
    setFitNote('');
    change([{ start: 0, end: duration(), speed: 1 }]);
    setSel({ start: 0, end: duration() });
  };

  const fit = () => {
    const target = parseTimecode(fitText());
    const solved = target === null ? null : speedToFit(duration(), target);
    if (!solved) {
      setFitNote(u.fitInvalid);
      return;
    }
    setSel({ start: 0, end: duration() });
    change([{ start: 0, end: duration(), speed: solved.speed }]);
    setFitNote(
      solved.clamped
        ? fmt(u.fitClamped, {
            min: times(MIN_SPEED),
            max: times(MAX_SPEED),
            speed: times(solved.speed),
            duration: formatTimecode(duration() / solved.speed),
          })
        : fmt(u.fitDone, { speed: times(solved.speed) }),
    );
  };

  /** While playing, keep the playback rate on the part under the playhead. */
  const follow = () => {
    // Seeking while playing calls this again; one loop, not one per seek.
    cancelAnimationFrame(frame);
    if (!video) return;
    const rate = speedAt(video.currentTime);
    if (video.playbackRate !== rate) video.playbackRate = rate;
    setPlayhead(video.currentTime);
    if (!video.paused) frame = requestAnimationFrame(follow);
  };

  const timeAt = (clientX: number) => {
    const box = bar!.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    return Math.min(duration(), Math.max(0, ratio * duration()));
  };

  const seek = (to: number) => {
    setPlayhead(to);
    if (video) {
      video.currentTime = to;
      video.playbackRate = speedAt(to);
    }
  };

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
    const list = pieces();
    if (!file || !s || list.length === 0) return;
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await speedVideo(file, list, {
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const previous = result();
      if (previous) URL.revokeObjectURL(previous.url);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url, name: outputName(s.name, '-speed', 'mp4') });
      setStatus(fmt(u.doneStatus, { duration: formatTimecode(outputDuration(list)), size: size(out.byteLength) }));
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const handleClass =
    'absolute top-0 z-20 h-full w-4 -translate-x-1/2 cursor-ew-resize touch-none rounded ' +
    'border border-bg bg-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoSpeedPreview}>
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
            <label class="mb-2 block text-sm font-medium" for="speed-file">
              {u.pickLabel}
            </label>
            <input
              id="speed-file"
              type="file"
              accept="video/*"
              onChange={(e) => void onPick(e)}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={source()}>
              {(s) => (
                <p class="mt-2 text-xs text-muted">
                  {fmt(u.fileMeta, { name: s().name, size: size(s().bytes), duration: formatTimecode(s().duration) })}
                </p>
              )}
            </Show>
          </div>

          <Show when={source()}>
            {(s) => (
              <>
                <div class="space-y-2">
                  <video
                    ref={video}
                    src={s().url}
                    controls
                    onPlay={follow}
                    onSeeked={follow}
                    onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                    class="max-h-80 w-full rounded border border-border"
                  />
                  <p class="text-xs text-muted">{u.previewNote}</p>
                </div>

                <div>
                  <p class="mb-2 text-sm font-medium">{u.timelineLabel}</p>
                  <div class="px-2">
                    <div
                      ref={bar}
                      onPointerDown={(e) => seek(timeAt(e.clientX))}
                      class="relative h-16 w-full touch-none rounded border border-border bg-surface"
                    >
                      <div class="absolute inset-0 overflow-hidden rounded">
                        <For each={pieces()}>
                          {(p) => (
                            <div
                              class="absolute inset-y-0 flex items-center justify-center overflow-hidden text-xs font-semibold"
                              classList={{
                                'bg-accent text-accent-fg': p.speed > 1,
                                'bg-accent-soft text-fg': p.speed < 1,
                                'text-muted': p.speed === 1,
                              }}
                              style={{ left: pct(p.start), width: pct(p.end - p.start) }}
                            >
                              <Show when={(p.end - p.start) / duration() > 0.06}>{times(p.speed)}</Show>
                            </div>
                          )}
                        </For>
                        <div
                          class="absolute inset-y-0 z-10 rounded-sm border-2 border-fg"
                          style={{ left: pct(sel().start), width: pct(sel().end - sel().start) }}
                        />
                        <div class="absolute inset-y-0 z-10 w-0.5 bg-fg" style={{ left: pct(playhead()) }} />
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
                    <label class="mb-1 block text-xs font-medium" for="speed-start">
                      {u.startLabel}
                    </label>
                    <input
                      id="speed-start"
                      type="text"
                      inputmode="decimal"
                      value={formatTimecode(sel().start)}
                      onChange={(e) => setEdge('start', e.currentTarget.value)}
                      class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </div>
                  <div>
                    <label class="mb-1 block text-xs font-medium" for="speed-end">
                      {u.endLabel}
                    </label>
                    <input
                      id="speed-end"
                      type="text"
                      inputmode="decimal"
                      value={formatTimecode(sel().end)}
                      onChange={(e) => setEdge('end', e.currentTarget.value)}
                      class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </div>
                </div>

                <div role="group" aria-labelledby="speed-buttons-label">
                  <p id="speed-buttons-label" class="mb-2 text-sm font-medium">
                    {sel().start <= 0 && sel().end >= duration() ? u.speedWhole : u.speedPart}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <For each={SPEEDS}>
                      {(speed) => (
                        <Button
                          variant={selSpeed() === speed ? 'solid' : 'outline'}
                          color={selSpeed() === speed ? 'primary' : 'neutral'}
                          aria-pressed={selSpeed() === speed}
                          onClick={() => apply(speed)}
                          disabled={busy()}
                        >
                          {times(speed)}
                        </Button>
                      )}
                    </For>
                  </div>
                </div>

                <div>
                  <label class="mb-1 block text-sm font-medium" for="speed-fit">
                    {u.fitLabel}
                  </label>
                  <div class="flex flex-wrap items-center gap-3">
                    <input
                      id="speed-fit"
                      type="text"
                      inputmode="decimal"
                      placeholder="1:00"
                      value={fitText()}
                      onInput={(e) => setFitText(e.currentTarget.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fit()}
                      class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                    <Button variant="outline" color="neutral" onClick={fit} disabled={busy()}>
                      {u.fitAction}
                    </Button>
                  </div>
                  <p class="mt-2 text-xs text-muted">{fitNote() || u.fitHelp}</p>
                </div>

                <p class="text-sm text-fg">
                  {fmt(u.outputInfo, { out: formatTimecode(outLength()), total: formatTimecode(s().duration) })}
                  <Show when={pieces().length > 1}>
                    <span class="text-muted"> {fmt(u.piecesInfo, { count: String(pieces().length) })}</span>
                  </Show>
                </p>

                <p class="text-xs text-muted">{u.timeNote}</p>

                <div class="flex flex-wrap gap-3">
                  <Button onClick={() => void run()} disabled={busy()}>
                    {busy() ? u.working : u.action}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy()}>
                    {u.reset}
                  </Button>
                </div>
              </>
            )}
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
                  download={r().name}
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
      <ToolContent route="video-speed" />
    </main>
  );
}
