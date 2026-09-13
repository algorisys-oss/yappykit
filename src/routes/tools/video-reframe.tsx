import { createSignal, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoReframePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode } from '@core/video/trim';
import {
  TARGETS,
  cropWindow,
  fitCanvas,
  panAxis,
  type ReframeMode,
  type TargetId,
} from '@core/video/reframe';
import { reframeVideo } from '@core/video/ffmpeg';

/**
 * Reframe a video for Reels, Shorts and TikTok, a square post, 4:5 or 16:9.
 *
 * The preview stage is the output's shape, and what it shows is the output's
 * framing. In fill mode that is the video with `object-fit: cover`, positioned
 * by the same `pan` number the export crops with; CSS `object-position` and
 * `cropWindow` mean the same thing by it, so the preview cannot drift from the
 * file. In fit mode it is the video contained over a blurred copy of itself.
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

const TARGET_IDS: readonly TargetId[] = ['vertical', 'square', 'portrait', 'landscape'];

export default function VideoReframe() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-reframe'];
  const u = tt.ui;
  useSeo('video-reframe');

  const targetText: Record<TargetId, { label: string; hint: string }> = {
    vertical: { label: u.targetVertical, hint: u.targetVerticalHint },
    square: { label: u.targetSquare, hint: u.targetSquareHint },
    portrait: { label: u.targetPortrait, hint: u.targetPortraitHint },
    landscape: { label: u.targetLandscape, hint: u.targetLandscapeHint },
  };

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [target, setTarget] = createSignal<TargetId>('vertical');
  const [mode, setMode] = createSignal<ReframeMode>('fill');
  const [pan, setPan] = createSignal(0.5);
  const [playhead, setPlayhead] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [result, setResult] = createSignal<{ bytes: number; url: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let stage: HTMLDivElement | undefined;
  let video: HTMLVideoElement | undefined;
  let backdrop: HTMLVideoElement | undefined;
  let grab: { x: number; y: number; pan: number } | null = null;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-reframe'], detectCapabilities()).supported),
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
  // A new version waits rather than reloading a clip and its framing away.
  useHoldWorkWhile(() => source() !== null);

  const ratio = () => TARGETS[target()];
  const frame = () => {
    const s = source();
    return s ? { width: s.width, height: s.height } : null;
  };
  const axis = createMemo(() => {
    const f = frame();
    return f ? panAxis(f, ratio()) : null;
  });
  const outputSize = createMemo(() => {
    const f = frame();
    if (!f) return null;
    if (mode() === 'fit') return fitCanvas(f, ratio());
    const w = cropWindow(f, ratio(), pan());
    return { width: w.w, height: w.h };
  });
  const objectPosition = () =>
    axis() === 'y' ? `50% ${pan() * 100}%` : axis() === 'x' ? `${pan() * 100}% 50%` : '50% 50%';

  const changed = (apply: () => void) => {
    clearResult();
    setError('');
    setStatus('');
    apply();
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setSource(null);
    setStatus('');
    setError('');
    setProgress(0);
    setPlayhead(0);
    setPlaying(false);
    setPan(0.5);
    file = f;
    try {
      const info = await readVideoInfo(f);
      setSource({ url: URL.createObjectURL(f), ...info, bytes: f.size, name: f.name });
    } catch {
      file = null;
      setError(u.readError);
    }
  }

  /**
   * Dragging moves the picture, not the window, which is how every phone editor
   * behaves: pull the subject to the right and it moves right. The distance is
   * measured against how far the covered picture can actually travel on screen.
   */
  function onStageDown(e: PointerEvent) {
    if (mode() !== 'fill' || !axis() || busy()) return;
    e.preventDefault();
    stage!.setPointerCapture(e.pointerId);
    grab = { x: e.clientX, y: e.clientY, pan: pan() };
  }

  function onStageMove(e: PointerEvent) {
    const f = frame();
    if (!grab || !f || !stage) return;
    const box = stage.getBoundingClientRect();
    const scale = Math.max(box.width / f.width, box.height / f.height);
    const travel = axis() === 'x' ? f.width * scale - box.width : f.height * scale - box.height;
    if (travel <= 0) return;
    const moved = axis() === 'x' ? e.clientX - grab.x : e.clientY - grab.y;
    const next = Math.min(1, Math.max(0, grab.pan - moved / travel));
    changed(() => setPan(next));
  }

  const syncBackdrop = () => {
    if (!video || !backdrop) return;
    if (Math.abs(backdrop.currentTime - video.currentTime) > 0.25) backdrop.currentTime = video.currentTime;
  };

  const seek = (to: number) => {
    setPlayhead(to);
    if (video) video.currentTime = to;
    if (backdrop) backdrop.currentTime = to;
  };

  const togglePlay = () => {
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  async function run() {
    const s = source();
    const f = frame();
    if (!file || !s || !f) return;
    video?.pause();
    clearResult();
    setError('');
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await reframeVideo(file, {
        mode: mode(),
        ratio: ratio(),
        pan: pan(),
        frame: f,
        duration: s.duration,
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url });
      const o = outputSize()!;
      setStatus(fmt(u.doneStatus, { width: o.width, height: o.height, size: size(out.byteLength) }));
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const smallButton =
    'cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} tool="video-reframe" preview={VideoReframePreview}>
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
            <label class="mb-2 block text-sm font-medium" for="reframe-file">
              {u.pickLabel}
            </label>
            <input
              id="reframe-file"
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
                <div>
                  <p class="mb-2 text-sm font-medium">{u.targetLabel}</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <For each={TARGET_IDS}>
                      {(id) => (
                        <button
                          type="button"
                          aria-pressed={target() === id}
                          disabled={busy()}
                          onClick={() => changed(() => setTarget(id))}
                          class="cursor-pointer rounded border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
                          classList={{
                            'border-accent bg-accent text-accent-fg': target() === id,
                            'border-border bg-bg text-fg': target() !== id,
                          }}
                        >
                          <span class="block font-medium">{targetText[id].label}</span>
                          <span class="block text-xs opacity-80">{targetText[id].hint}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <fieldset>
                  <legend class="mb-2 text-sm font-medium">{u.modeLabel}</legend>
                  <div class="space-y-2">
                    {(
                      [
                        ['fill', u.modeFill, u.modeFillHint],
                        ['fit', u.modeFit, u.modeFitHint],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label class="flex items-start gap-2 text-sm text-fg">
                        <input
                          type="radio"
                          name="reframe-mode"
                          value={value}
                          checked={mode() === value}
                          disabled={busy()}
                          onChange={() => changed(() => setMode(value))}
                          class="mt-1"
                        />
                        <span>
                          <span class="font-medium">{label}</span>
                          <span class="block text-xs text-muted">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <p class="mb-2 text-sm font-medium">{u.previewHeading}</p>
                  <Show when={mode() === 'fill' && axis()}>
                    <p class="mb-3 text-xs text-muted">{u.dragHint}</p>
                  </Show>
                  <Show when={mode() === 'fill' && !axis()}>
                    <p class="mb-3 text-xs text-muted">{u.sameShape}</p>
                  </Show>

                  <div
                    ref={stage}
                    data-reframe-stage
                    onPointerDown={onStageDown}
                    onPointerMove={onStageMove}
                    onPointerUp={() => (grab = null)}
                    onPointerCancel={() => (grab = null)}
                    class="relative mx-auto touch-none select-none overflow-hidden rounded border border-border bg-bg"
                    classList={{ 'cursor-grab': mode() === 'fill' && !!axis() }}
                    style={{ width: `min(100%, calc(24rem * ${ratio()}))`, 'aspect-ratio': String(ratio()) }}
                  >
                    <Show when={mode() === 'fit'}>
                      {/* The blurred copy behind the picture. CSS stands in for the export's
                        box blur; it only has to show where the bars will be. */}
                      <video
                        ref={backdrop}
                        src={s().url}
                        muted
                        playsinline
                        preload="auto"
                        aria-hidden="true"
                        class="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover"
                        style={{ filter: 'blur(14px)' }}
                      />
                    </Show>
                    <video
                      ref={video}
                      src={s().url}
                      playsinline
                      preload="auto"
                      onTimeUpdate={(e) => {
                        setPlayhead(e.currentTarget.currentTime);
                        syncBackdrop();
                      }}
                      onPlay={() => {
                        setPlaying(true);
                        void backdrop?.play().catch(() => {});
                      }}
                      onPause={() => {
                        setPlaying(false);
                        backdrop?.pause();
                        syncBackdrop();
                      }}
                      onEnded={() => setPlaying(false)}
                      class="pointer-events-none relative block h-full w-full"
                      classList={{ 'object-cover': mode() === 'fill', 'object-contain': mode() === 'fit' }}
                      style={{ 'object-position': mode() === 'fill' ? objectPosition() : '50% 50%' }}
                    />
                  </div>

                  <Show when={mode() === 'fill' && axis()}>
                    <div class="mt-3">
                      <label class="mb-1 block text-xs font-medium" for="reframe-position">
                        {u.positionLabel}
                      </label>
                      <input
                        id="reframe-position"
                        type="range"
                        min="0"
                        max="1"
                        step="0.001"
                        value={pan()}
                        disabled={busy()}
                        onInput={(e) => changed(() => setPan(Number(e.currentTarget.value)))}
                        class="w-full"
                      />
                    </div>
                  </Show>

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

                <Show when={outputSize()}>
                  {(o) => (
                    <p class="text-sm text-fg" data-reframe-output>
                      {fmt(u.outputInfo, { width: o().width, height: o().height })}
                    </p>
                  )}
                </Show>

                <p class="rounded border border-border bg-surface p-3 text-sm text-muted">{u.timeNote}</p>

                <Button onClick={() => void run()} disabled={busy()}>
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
                  download={`reframed-${(source()?.name ?? 'video').replace(/\.[a-z0-9]+$/i, '')}.mp4`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: size(r().bytes) })}
                </a>
                <video src={r().url} controls class="mx-auto max-h-96 max-w-full rounded border border-border" />
                <p class="text-xs text-muted">{u.verifyHint}</p>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-reframe" />
    </main>
  );
}
