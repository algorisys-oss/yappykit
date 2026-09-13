import { createSignal, createMemo, Show, For, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoSplitPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode } from '@core/video/trim';
import { splitRanges, partName, SPLIT_LENGTHS, type SplitMode } from '@core/video/split-join';
import { zip } from '@core/archive/zip';
import { splitVideo } from '@core/video/ffmpeg';

/**
 * Split a video into parts, by a length limit or into equal parts.
 *
 * The limit is the outcome people come with: a status or story that refuses
 * anything over 30 seconds. Every part is cut frame accurately, so none runs
 * over the limit it was cut for.
 */

interface Source {
  name: string;
  bytes: number;
  duration: number;
}

interface Part {
  name: string;
  url: string;
  bytes: number;
  length: number;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function VideoSplit() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-split'];
  const u = tt.ui;
  useSeo('video-split');

  const [supported, setSupported] = createSignal(true);
  const [source, setSource] = createSignal<Source | null>(null);
  const [kind, setKind] = createSignal<SplitMode['kind']>('length');
  const [seconds, setSeconds] = createSignal<number>(30);
  const [count, setCount] = createSignal(2);
  const [parts, setParts] = createSignal<Part[]>([]);
  const [zipUrl, setZipUrl] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  let file: File | null = null;

  onMount(() => setSupported(evaluate(TOOL_CAPABILITIES['video-split'], detectCapabilities()).supported));

  const clearResults = () => {
    for (const p of parts()) URL.revokeObjectURL(p.url);
    if (zipUrl()) URL.revokeObjectURL(zipUrl());
    setParts([]);
    setZipUrl('');
  };
  onCleanup(clearResults);
  useHoldWorkWhile(() => source() !== null);

  const mode = (): SplitMode =>
    kind() === 'count' ? { kind: 'count', count: count() } : { kind: 'length', seconds: seconds() };

  const plan = createMemo(() => {
    const s = source();
    if (!s) return [];
    try {
      return splitRanges(s.duration, mode());
    } catch {
      return [];
    }
  });

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    clearResults();
    setStatus('');
    file = f;
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (!Number.isFinite(v.duration) || v.duration <= 0) {
        setSource(null);
        setStatus(u.readError);
        return;
      }
      setSource({ name: f.name, bytes: f.size, duration: v.duration });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      setSource(null);
      setStatus(u.readError);
    };
    v.src = url;
  }

  const changed = () => {
    clearResults();
    setStatus('');
  };

  async function run() {
    const s = source();
    const ranges = plan();
    if (!file || !s || ranges.length < 2) return;
    clearResults();
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const outputs = await splitVideo(file, ranges, {
        onReady: () => setStatus(fmt(u.working, { index: '1', total: String(ranges.length) })),
        onPart: (i) => setStatus(fmt(u.working, { index: String(i + 1), total: String(ranges.length) })),
        onProgress: setProgress,
      });
      const made = outputs.map((bytes, i) => ({
        name: partName(s.name, i, ranges.length),
        url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' })),
        bytes: bytes.byteLength,
        length: ranges[i]!.end - ranges[i]!.start,
      }));
      const archive = zip(outputs.map((bytes, i) => ({ name: made[i]!.name, bytes })));
      setParts(made);
      setZipUrl(URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' })));
      setStatus(fmt(u.doneStatus, { count: String(made.length) }));
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  const choice = (on: boolean) =>
    'flex cursor-pointer items-start gap-3 rounded border p-3 ' + (on ? 'border-accent bg-accent-soft' : 'border-border');

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} tool="video-split" preview={VideoSplitPreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={<p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">{u.unsupported}</p>}
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="split-file">
              {u.pickLabel}
            </label>
            <input
              id="split-file"
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
            <fieldset>
              <legend class="mb-2 text-sm font-medium">{u.modeLabel}</legend>
              <div class="space-y-2">
                <label class={choice(kind() === 'length')}>
                  <input type="radio" name="split-kind" class="mt-1" checked={kind() === 'length'} onChange={() => { setKind('length'); changed(); }} />
                  <span class="flex-1">
                    <span class="block text-sm font-medium">{u.modeLength}</span>
                    <span class="mt-2 flex flex-wrap gap-2">
                      <For each={SPLIT_LENGTHS}>
                        {(sec) => (
                          <Button
                            size="sm"
                            variant={kind() === 'length' && seconds() === sec ? 'solid' : 'outline'}
                            color={kind() === 'length' && seconds() === sec ? 'primary' : 'neutral'}
                            aria-pressed={kind() === 'length' && seconds() === sec}
                            onClick={(e) => {
                              e.preventDefault();
                              setKind('length');
                              setSeconds(sec);
                              changed();
                            }}
                          >
                            {fmt(u.seconds, { n: String(sec) })}
                          </Button>
                        )}
                      </For>
                    </span>
                    <span class="mt-1 block text-xs text-muted">{u.modeLengthHint}</span>
                  </span>
                </label>
                <label class={choice(kind() === 'count')}>
                  <input type="radio" name="split-kind" class="mt-1" checked={kind() === 'count'} onChange={() => { setKind('count'); changed(); }} />
                  <span class="flex-1">
                    <span class="block text-sm font-medium">{u.modeCount}</span>
                    <input
                      id="split-count"
                      type="number"
                      min="2"
                      max="50"
                      value={count()}
                      aria-label={u.modeCount}
                      onInput={(e) => {
                        const n = Math.round(Number(e.currentTarget.value));
                        if (n >= 2 && n <= 50) {
                          setKind('count');
                          setCount(n);
                          changed();
                        }
                      }}
                      class="mt-2 w-20 rounded border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </span>
                </label>
              </div>
            </fieldset>

            <div class="rounded border border-border bg-surface p-3 text-sm text-fg" data-split-plan>
              <Show when={plan().length >= 2} fallback={u.tooShort}>
                {fmt(u.plan, { count: String(plan().length), lengths: plan().map((p) => formatTimecode(p.end - p.start)).join(', ') })}
              </Show>
            </div>

            <p class="text-xs text-muted">{u.timeNote}</p>

            <Button onClick={() => void run()} disabled={busy() || plan().length < 2}>
              {busy() ? u.busy : u.action}
            </Button>
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

          <Show when={parts().length > 0}>
            <section class="space-y-3">
              <a
                href={zipUrl()}
                download={`${(source()?.name ?? 'video').replace(/\.[a-z0-9]+$/i, '')}-parts.zip`}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {u.downloadAll}
              </a>
              <ul class="m-0 list-none space-y-2 p-0">
                <For each={parts()}>
                  {(p) => (
                    <li class="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm">
                      <span class="min-w-0 break-all">{p.name}</span>
                      <span class="flex items-center gap-3 text-xs text-muted">
                        <span class="tabular-nums">
                          {formatTimecode(p.length)} · {size(p.bytes)}
                        </span>
                        <a href={p.url} download={p.name} class="font-medium text-accent">
                          {u.download}
                        </a>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
              <p class="text-xs text-muted">{u.verifyHint}</p>
            </section>
          </Show>
        </div>
      </Show>
      <ToolContent route="video-split" />
    </main>
  );
}
