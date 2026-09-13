import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoGifPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode, parseTimecode, MIN_SEGMENT_SEC } from '@core/video/trim';
import { defaultRange, type AnimatedFormat, type AnimatedSettings } from '@core/video/animated';
import { outputName } from '@core/video/audio';
import { animateVideo } from '@core/video/ffmpeg';

/**
 * A stretch of video as a GIF or animated WebP, under a size.
 *
 * The user picks where it is going by size, and the page solves for the picture
 * size and frame rate (./animated). The result says what it settled on, so a
 * GIF that had to shrink to fit is not a surprise found after posting it.
 */

const TARGETS = [
  { mb: 1, label: 'target1', hint: 'target1Hint' },
  { mb: 2, label: 'target2', hint: 'target2Hint' },
  { mb: 5, label: 'target5', hint: 'target5Hint' },
] as const;

interface Source {
  url: string;
  duration: number;
  width: number;
  height: number;
  bytes: number;
  name: string;
}

interface Result {
  url: string;
  bytes: number;
  name: string;
  settings: AnimatedSettings;
  withinBudget: boolean;
  format: AnimatedFormat;
  budgetMb: number;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function VideoGif() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-gif'];
  const u = tt.ui;
  useSeo('video-gif');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [start, setStart] = createSignal(0);
  const [end, setEnd] = createSignal(0);
  const [format, setFormat] = createSignal<AnimatedFormat>('gif');
  const [targetMb, setTargetMb] = createSignal<number>(2);
  const [result, setResult] = createSignal<Result | null>(null);
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;
  let video: HTMLVideoElement | undefined;

  onMount(() => setSupported(evaluate(TOOL_CAPABILITIES['video-gif'], detectCapabilities()).supported));

  const revoke = () => {
    const s = source();
    const r = result();
    if (s) URL.revokeObjectURL(s.url);
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(revoke);
  useHoldWorkWhile(() => source() !== null);

  const length = () => Math.max(0, end() - start());

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    revoke();
    setResult(null);
    setStatus('');
    setProgress(0);
    file = f;
    const url = URL.createObjectURL(f);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const d = probe.duration;
      if (!Number.isFinite(d) || d <= 0 || probe.videoWidth === 0) {
        URL.revokeObjectURL(url);
        setSource(null);
        setStatus(u.readError);
        return;
      }
      const range = defaultRange(d);
      setStart(range.start);
      setEnd(range.end);
      setSource({ url, duration: d, width: probe.videoWidth, height: probe.videoHeight, bytes: f.size, name: f.name });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setSource(null);
      setStatus(u.readError);
    };
    probe.src = url;
  }

  const changed = () => {
    setResult(null);
    setStatus('');
  };

  /** Keep start before end, both inside the clip. */
  function setEdge(which: 'start' | 'end', at: number) {
    const d = source()?.duration ?? 0;
    const t = Math.min(d, Math.max(0, at));
    if (which === 'start') setStart(Math.min(t, end() - MIN_SEGMENT_SEC));
    else setEnd(Math.max(t, start() + MIN_SEGMENT_SEC));
    changed();
  }

  const typed = (which: 'start' | 'end', text: string) => {
    const parsed = parseTimecode(text);
    if (parsed !== null) setEdge(which, parsed);
  };

  async function run() {
    const s = source();
    if (!file || !s) return;
    const chosenFormat = format();
    const mb = targetMb();
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await animateVideo(file, {
        format: chosenFormat,
        budgetBytes: mb * 1024 * 1024,
        start: start(),
        duration: length(),
        frame: { width: s.width, height: s.height },
        onReady: () => setStatus(u.working),
        onEncode: (attempt) => setStatus(attempt === 1 ? u.working : u.retrying),
        onProgress: setProgress,
      });
      const previous = result();
      if (previous) URL.revokeObjectURL(previous.url);
      const type = chosenFormat === 'gif' ? 'image/gif' : 'image/webp';
      setResult({
        url: URL.createObjectURL(new Blob([out.output as BlobPart], { type })),
        bytes: out.output.byteLength,
        name: outputName(s.name, '', chosenFormat),
        settings: out.settings,
        withinBudget: out.withinBudget,
        format: chosenFormat,
        budgetMb: mb,
      });
      setStatus(
        fmt(u.doneStatus, {
          size: size(out.output.byteLength),
          width: String(out.settings.width),
          height: String(out.settings.height),
          fps: String(out.settings.fps),
        }),
      );
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const choiceClass = (on: boolean) =>
    'flex cursor-pointer items-start gap-3 rounded border p-3 ' + (on ? 'border-accent bg-accent-soft' : 'border-border');

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoGifPreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={<p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">{u.unsupported}</p>}
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="gif-file">
              {u.pickLabel}
            </label>
            <input
              id="gif-file"
              type="file"
              accept="video/*"
              onChange={onPick}
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
                <video ref={video} src={s().url} controls class="max-h-80 w-full rounded border border-border" />

                <div>
                  <p class="mb-2 text-sm font-medium">{u.rangeLabel}</p>
                  <div class="flex flex-wrap items-end gap-4">
                    <For each={['start', 'end'] as const}>
                      {(which) => (
                        <div>
                          <label class="mb-1 block text-xs font-medium" for={`gif-${which}`}>
                            {which === 'start' ? u.startLabel : u.endLabel}
                          </label>
                          <div class="flex items-center gap-2">
                            <input
                              id={`gif-${which}`}
                              type="text"
                              inputmode="decimal"
                              value={formatTimecode(which === 'start' ? start() : end())}
                              onChange={(e) => typed(which, e.currentTarget.value)}
                              class="w-24 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => video && setEdge(which, video.currentTime)}
                              disabled={busy()}
                            >
                              {which === 'start' ? u.startHere : u.endHere}
                            </Button>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                  <p class="mt-2 text-xs text-muted">
                    {fmt(u.rangeInfo, { length: formatTimecode(length()) })} {length() > 15 ? u.longNote : ''}
                  </p>
                </div>

                <fieldset>
                  <legend class="mb-2 text-sm font-medium">{u.formatLabel}</legend>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <For each={['gif', 'webp'] as const}>
                      {(f) => (
                        <label class={choiceClass(format() === f)}>
                          <input
                            type="radio"
                            name="gif-format"
                            class="mt-1"
                            checked={format() === f}
                            onChange={() => {
                              setFormat(f);
                              changed();
                            }}
                          />
                          <span>
                            <span class="block text-sm font-medium">{f === 'gif' ? u.formatGif : u.formatWebp}</span>
                            <span class="block text-xs text-muted">{f === 'gif' ? u.formatGifHint : u.formatWebpHint}</span>
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>

                <fieldset>
                  <legend class="mb-2 text-sm font-medium">{u.targetLabel}</legend>
                  <div class="grid gap-2 sm:grid-cols-3">
                    <For each={TARGETS}>
                      {(target) => (
                        <label class={choiceClass(targetMb() === target.mb)}>
                          <input
                            type="radio"
                            name="gif-target"
                            class="mt-1"
                            checked={targetMb() === target.mb}
                            onChange={() => {
                              setTargetMb(target.mb);
                              changed();
                            }}
                          />
                          <span>
                            <span class="block text-sm font-medium">{u[target.label]}</span>
                            <span class="block text-xs text-muted">{u[target.hint]}</span>
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>

                <p class="text-xs text-muted">{u.timeNote}</p>

                <Button onClick={() => void run()} disabled={busy() || length() < MIN_SEGMENT_SEC}>
                  {busy() ? u.working : format() === 'gif' ? u.actionGif : u.actionWebp}
                </Button>
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
                <Show when={!r().withinBudget}>
                  <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
                    {fmt(u.overBudget, { target: `${r().budgetMb} MB`, size: size(r().bytes) })}
                  </p>
                </Show>
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: size(r().bytes) })}
                </a>
                <img
                  src={r().url}
                  alt={u.resultAlt}
                  width={r().settings.width}
                  height={r().settings.height}
                  class="h-auto max-w-full rounded border border-border"
                />
                <p class="text-xs text-muted">{r().format === 'webp' ? u.webpNote : u.verifyHint}</p>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-gif" />
    </main>
  );
}
