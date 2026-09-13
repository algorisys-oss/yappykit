import { createSignal, createMemo, Show, Index, onMount, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoJoinPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { useHoldWorkWhile } from '../../lib/work-guard';
import { formatTimecode } from '@core/video/trim';
import { joinTarget, moveItem } from '@core/video/split-join';
import { joinVideos } from '@core/video/ffmpeg';

/**
 * Join several videos into one, in the order the user sets.
 *
 * The first clip decides the size of the result, and the page says so before
 * anything is encoded, because a portrait phone clip after a landscape screen
 * recording will be letterboxed rather than stretched.
 */

interface Clip {
  file: File;
  name: string;
  bytes: number;
  duration: number;
  width: number;
  height: number;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

function readClip(file: File): Promise<Clip> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) reject(new Error('unreadable'));
      else resolve({ file, name: file.name, bytes: file.size, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    v.src = url;
  });
}

export default function VideoJoin() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-join'];
  const u = tt.ui;
  useSeo('video-join');

  const [supported, setSupported] = createSignal(true);
  const [clips, setClips] = createSignal<Clip[]>([]);
  const [rejected, setRejected] = createSignal<string[]>([]);
  const [result, setResult] = createSignal<{ url: string; bytes: number } | null>(null);
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  onMount(() => setSupported(evaluate(TOOL_CAPABILITIES['video-join'], detectCapabilities()).supported));

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
    setStatus('');
  };
  onCleanup(clearResult);
  useHoldWorkWhile(() => clips().length > 0);

  const total = createMemo(() => clips().reduce((sum, c) => sum + c.duration, 0));
  const target = createMemo(() => (clips().length > 0 ? joinTarget(clips().map((c) => ({ ...c, fps: null }))) : null));

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (files.length === 0) return;
    clearResult();
    const read = await Promise.allSettled(files.map(readClip));
    const ok = read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    setRejected(files.filter((_, i) => read[i]!.status === 'rejected').map((f) => f.name));
    setClips([...clips(), ...ok]);
  }

  const move = (index: number, by: -1 | 1) => {
    clearResult();
    setClips(moveItem(clips(), index, by));
  };

  const remove = (index: number) => {
    clearResult();
    setClips(clips().filter((_, i) => i !== index));
  };

  async function run() {
    const list = clips();
    if (list.length < 2) return;
    clearResult();
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await joinVideos(
        list.map((c) => c.file),
        { clips: list, onReady: () => setStatus(u.working), onProgress: setProgress },
      );
      setResult({ url: URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' })), bytes: out.byteLength });
      setStatus(fmt(u.doneStatus, { duration: formatTimecode(total()), size: size(out.byteLength) }));
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} tool="video-join" preview={VideoJoinPreview}>
        {tt.heroNote}
      </ToolHero>

      <Show
        when={supported()}
        fallback={<p class="mt-8 rounded border border-danger bg-danger-soft p-4 text-sm text-fg">{u.unsupported}</p>}
      >
        <div class="mt-8 space-y-6">
          <div>
            <label class="mb-2 block text-sm font-medium" for="join-files">
              {clips().length === 0 ? u.pickLabel : u.addMore}
            </label>
            <input
              id="join-files"
              type="file"
              accept="video/*"
              multiple
              onChange={(e) => void onPick(e)}
              disabled={busy()}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={rejected().length > 0}>
              <p class="mt-2 rounded border border-danger bg-danger-soft p-2 text-xs text-fg" role="alert">
                {fmt(u.readError, { names: rejected().join(', ') })}
              </p>
            </Show>
          </div>

          <Show when={clips().length > 0}>
            <section class="space-y-2">
              <h2 class="text-sm font-medium">{u.orderLabel}</h2>
              <ol class="m-0 list-none space-y-2 p-0">
                <Index each={clips()}>
                  {(c, i) => (
                    <li class="flex flex-wrap items-center gap-3 rounded border border-border p-2 text-sm" data-join-clip>
                      <span class="w-6 text-center font-mono text-xs text-muted">{i + 1}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block break-all">{c().name}</span>
                        <span class="block text-xs text-muted tabular-nums">
                          {formatTimecode(c().duration)} · {c().width} × {c().height} · {size(c().bytes)}
                        </span>
                      </span>
                      <span class="flex gap-1">
                        <Button size="xs" variant="outline" color="neutral" onClick={() => move(i, -1)} disabled={busy() || i === 0} aria-label={fmt(u.moveUp, { name: c().name })}>
                          ↑
                        </Button>
                        <Button size="xs" variant="outline" color="neutral" onClick={() => move(i, 1)} disabled={busy() || i === clips().length - 1} aria-label={fmt(u.moveDown, { name: c().name })}>
                          ↓
                        </Button>
                        <Button size="xs" variant="outline" color="neutral" onClick={() => remove(i)} disabled={busy()} aria-label={fmt(u.removeClip, { name: c().name })}>
                          ✕
                        </Button>
                      </span>
                    </li>
                  )}
                </Index>
              </ol>
            </section>

            <Show when={target()}>
              {(tg) => (
                <p class="text-sm text-fg" data-join-output>
                  {fmt(u.outputInfo, { width: String(tg().width), height: String(tg().height), duration: formatTimecode(total()) })}
                </p>
              )}
            </Show>
            <p class="-mt-4 text-xs text-muted">{u.sizeNote}</p>

            <Show when={clips().length < 2}>
              <p class="text-sm text-muted">{u.needTwo}</p>
            </Show>

            <p class="text-xs text-muted">{u.timeNote}</p>

            <Button onClick={() => void run()} disabled={busy() || clips().length < 2}>
              {busy() ? u.working : u.action}
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

          <Show when={result()}>
            {(r) => (
              <div class="space-y-3">
                <a
                  href={r().url}
                  download="joined.mp4"
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
      <ToolContent route="video-join" />
    </main>
  );
}
