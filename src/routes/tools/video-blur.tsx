import { createSignal, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoBlurPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { rectFromDrag, isDegenerate, type Point } from '@core/redact/regions';
import { formatTimecode, parseTimecode } from '@core/video/trim';
import {
  usableMasks,
  withStart,
  withEnd,
  type BlurStrength,
  type Mask,
} from '@core/video/blur';
import { blurVideo } from '@core/video/ffmpeg';

/**
 * Blur a face, a number plate or a screen in a video.
 *
 * A mask is a box plus a span, held as a fraction of the frame so a box drawn
 * on a preview of whatever size the screen allowed lands in the same place on
 * the full-resolution video. The export burns the blur into the pixels, so it
 * cannot be peeled off the file afterwards, which is the point of the tool.
 *
 * The preview blurs with CSS rather than with the encoder, so it moves with the
 * video instantly. It is an approximation and deliberately the weaker of the
 * two: the export at "Unrecognisable" removes more than the preview shows, never
 * less, so the preview cannot talk anyone into trusting a box too far.
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

/** Preview blur in CSS pixels of the on-screen box, per strength. */
const PREVIEW_BLUR: Record<BlurStrength, string> = { strong: 'blur(12px)', soft: 'blur(3px)' };

/**
 * Duration and dimensions, from the browser.
 *
 * Kept local rather than shared with the trimmer's reader, as that one is: this
 * also needs the dimensions, and a file with a duration and no picture (an audio
 * file with a video extension) has to be refused here rather than at the encoder.
 */
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

export default function VideoBlur() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-blur'];
  const u = tt.ui;
  useSeo('video-blur');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [masks, setMasks] = createSignal<Mask[]>([]);
  const [drag, setDrag] = createSignal<{ start: Point; current: Point } | null>(null);
  const [playhead, setPlayhead] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [strength, setStrength] = createSignal<BlurStrength>('strong');
  const [result, setResult] = createSignal<{ bytes: number; url: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let surface: HTMLDivElement | undefined;
  let video: HTMLVideoElement | undefined;

  onMount(() =>
    setSupported(evaluate(TOOL_CAPABILITIES['video-blur'], detectCapabilities()).supported),
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

  const duration = () => source()?.duration ?? 0;
  const boxesLabel = (n: number) => (n === 1 ? u.boxesOne : fmt(u.boxesMany, { n }));
  const usable = createMemo(() => usableMasks(masks()));
  const isActive = (mk: Mask) => playhead() >= mk.start && playhead() < mk.end;

  const preview = createMemo(() => {
    const d = drag();
    return d ? rectFromDrag(d.start, d.current) : null;
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setSource(null);
    setMasks([]);
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

  /** Replace the mask list; any finished export no longer matches it. */
  const commit = (next: Mask[]) => {
    clearResult();
    setError('');
    setStatus('');
    setMasks(next);
  };

  /** Measured against the video, not the surface: the surface's border would
   *  put every stored box a pixel or two off the picture it was drawn over. */
  const pointFrom = (e: PointerEvent): Point => {
    const box = (video ?? surface!).getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  function onPointerDown(e: PointerEvent) {
    if (!source() || busy()) return;
    e.preventDefault();
    // The box is drawn on the frame in front of the user, so it has to stay there.
    video?.pause();
    surface!.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    setDrag({ start: p, current: p });
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag();
    if (!d) return;
    setDrag({ start: d.start, current: pointFrom(e) });
  }

  function onPointerUp() {
    const box = preview();
    setDrag(null);
    if (!box || isDegenerate(box)) return;
    commit([...masks(), { rect: box, start: 0, end: duration() }]);
  }

  const update = (i: number, next: Mask) => commit(masks().map((mk, j) => (j === i ? next : mk)));
  const remove = (i: number) => commit(masks().filter((_, j) => j !== i));

  function setEdge(i: number, which: 'start' | 'end', text: string) {
    const parsed = parseTimecode(text);
    const mk = masks()[i];
    if (parsed === null || !mk) return;
    update(i, which === 'start' ? withStart(mk, parsed, duration()) : withEnd(mk, parsed, duration()));
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
      setError(u.needMask);
      return;
    }
    video?.pause();
    clearResult();
    setError('');
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await blurVideo(file, usable(), {
        frame: { width: s.width, height: s.height },
        duration: s.duration,
        strength: strength(),
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url });
      setStatus(fmt(u.doneStatus, { boxes: boxesLabel(usable().length), size: size(out.byteLength) }));
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const smallButton =
    'cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40';
  const timeInput = 'w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoBlurPreview}>
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
            <label class="mb-2 block text-sm font-medium" for="blur-file">
              {u.pickLabel}
            </label>
            <input
              id="blur-file"
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
                  <p class="mb-2 text-sm font-medium">{u.drawHeading}</p>
                  <p class="mb-3 text-xs text-muted">{u.drawHint}</p>

                  {/* Shrink-wrapped to the video, never letterboxed: the boxes are
                    fractions of this element, so any bars around the picture
                    would shift every box off what it was drawn over. */}
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
                    <For each={masks()}>
                      {(mk, i) => (
                        <span
                          class="pointer-events-none absolute box-border border-2 border-fg"
                          classList={{ 'border-dashed': !isActive(mk) }}
                          style={{
                            left: `${mk.rect.x * 100}%`,
                            top: `${mk.rect.y * 100}%`,
                            width: `${mk.rect.w * 100}%`,
                            height: `${mk.rect.h * 100}%`,
                            'backdrop-filter': isActive(mk) ? PREVIEW_BLUR[strength()] : 'none',
                            '-webkit-backdrop-filter': isActive(mk)
                              ? PREVIEW_BLUR[strength()]
                              : 'none',
                          }}
                        >
                          <span class="absolute left-0 top-0 bg-fg px-1 text-xs font-medium text-bg">
                            {i() + 1}
                          </span>
                        </span>
                      )}
                    </For>
                    <Show when={preview()}>
                      {(r) => (
                        <span
                          class="pointer-events-none absolute box-border border-2 border-accent"
                          style={{
                            left: `${r().x * 100}%`,
                            top: `${r().y * 100}%`,
                            width: `${r().w * 100}%`,
                            height: `${r().h * 100}%`,
                          }}
                        />
                      )}
                    </Show>
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
                  <p class="mt-2 text-xs text-muted">{u.trackingNote}</p>
                </div>

                <fieldset>
                  <legend class="mb-2 text-sm font-medium">{u.strengthLabel}</legend>
                  <div class="space-y-2">
                    {(
                      [
                        ['strong', u.strengthStrong, u.strengthStrongHint],
                        ['soft', u.strengthSoft, u.strengthSoftHint],
                      ] as const
                    ).map(([value, label, hint]) => (
                      <label class="flex items-start gap-2 text-sm text-fg">
                        <input
                          type="radio"
                          name="video-blur-strength"
                          value={value}
                          checked={strength() === value}
                          onChange={() => {
                            clearResult();
                            setStrength(value);
                          }}
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
                  <p class="mb-2 text-sm font-medium">{u.masksHeading}</p>
                  <Show
                    when={masks().length > 0}
                    fallback={<p class="text-xs text-muted">{u.noMasks}</p>}
                  >
                    <ol class="space-y-3">
                      <For each={masks()}>
                        {(mk, i) => (
                          <li class="flex flex-wrap items-end gap-3 rounded border border-border bg-surface p-3">
                            <span class="self-center text-sm font-medium">
                              {fmt(u.maskName, { n: i() + 1 })}
                            </span>
                            <div>
                              <label class="mb-1 block text-xs font-medium" for={`blur-start-${i()}`}>
                                {u.startLabel}
                              </label>
                              <input
                                id={`blur-start-${i()}`}
                                type="text"
                                inputmode="decimal"
                                value={formatTimecode(mk.start)}
                                onChange={(e) => setEdge(i(), 'start', e.currentTarget.value)}
                                class={timeInput}
                              />
                            </div>
                            <div>
                              <label class="mb-1 block text-xs font-medium" for={`blur-end-${i()}`}>
                                {u.endLabel}
                              </label>
                              <input
                                id={`blur-end-${i()}`}
                                type="text"
                                inputmode="decimal"
                                value={formatTimecode(mk.end)}
                                onChange={(e) => setEdge(i(), 'end', e.currentTarget.value)}
                                class={timeInput}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => update(i(), withStart(mk, playhead(), duration()))}
                              disabled={busy()}
                              class={smallButton}
                            >
                              {u.startHere}
                            </button>
                            <button
                              type="button"
                              onClick={() => update(i(), withEnd(mk, playhead(), duration()))}
                              disabled={busy()}
                              class={smallButton}
                            >
                              {u.endHere}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(i())}
                              disabled={busy()}
                              class={smallButton}
                            >
                              {u.remove}
                            </button>
                          </li>
                        )}
                      </For>
                    </ol>
                    <div class="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => commit(masks().slice(0, -1))}
                        disabled={busy()}
                        class={smallButton}
                      >
                        {u.undo}
                      </button>
                      <button
                        type="button"
                        onClick={() => commit([])}
                        disabled={busy()}
                        class={smallButton}
                      >
                        {u.clear}
                      </button>
                    </div>
                  </Show>
                </div>

                <p class="rounded border border-border bg-surface p-3 text-sm text-muted">
                  {u.timeNote}
                </p>

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
                  download={`blurred-${(source()?.name ?? 'video').replace(/\.[a-z0-9]+$/i, '')}.mp4`}
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
      <ToolContent route="video-blur" />
    </main>
  );
}
