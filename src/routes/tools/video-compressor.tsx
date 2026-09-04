import { createSignal, Show, onMount, onCleanup } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { VideoPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { planBitrate } from '@core/video/bitrate';
import { transcodeVideo } from '@core/video/ffmpeg';

/**
 * Exact-Size Video Compressor.
 *
 * Outcome-driven: pick a video, pick a size limit, and the bitrate is computed
 * from the budget and duration (analytic-then-verify). Encoding runs on-device
 * with single-threaded ffmpeg.wasm — no upload, no cross-origin isolation needed
 * for this first version. The isolated multithreaded path (validated in
 * spike/coop-coep) is a later speed upgrade.
 */


// Values and byte budgets are fixed; the LABELS come from the active locale.
const TARGETS = [
  { value: '10mb', labelKey: 'targetUnder10mb', bytes: 10 * 1024 * 1024 },
  { value: 'whatsapp', labelKey: 'targetWhatsapp', bytes: 16 * 1024 * 1024 },
  { value: 'email', labelKey: 'targetEmail', bytes: 25 * 1024 * 1024 },
] as const;

type TargetValue = (typeof TARGETS)[number]['value'];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

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

export default function VideoCompressor() {
  const { m, fmt } = useI18n();
  const tt = m.tools['video-compress'];
  const u = tt.ui;
  useSeo('video-compress');
  const [supported, setSupported] = createSignal(true);
  const [target, setTarget] = createSignal<TargetValue>('whatsapp');
  const [fileName, setFileName] = createSignal('');
  const [original, setOriginal] = createSignal<{ bytes: number; url: string; duration: number } | null>(null);
  const [result, setResult] = createSignal<{ bytes: number; url: string } | null>(null);
  const [status, setStatus] = createSignal('');
  const [progress, setProgress] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  let file: File | null = null;

  onMount(() => setSupported(evaluate(TOOL_CAPABILITIES['video-compress'], detectCapabilities()).supported));

  const cleanup = () => {
    const o = original();
    const r = result();
    if (o) URL.revokeObjectURL(o.url);
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(cleanup);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    cleanup();
    setResult(null);
    setStatus('');
    setProgress(0);
    file = f;
    setFileName(f.name);
    try {
      const duration = await readDuration(f);
      setOriginal({ bytes: f.size, url: URL.createObjectURL(f), duration });
    } catch {
      setOriginal(null);
      setStatus(u.readError);
    }
  }

  async function run() {
    const o = original();
    if (!file || !o) return;
    const budget = TARGETS.find((t) => t.value === target())!.bytes;
    if (o.bytes <= budget) {
      setStatus(fmt(u.alreadySmall, { size: mb(o.bytes), target: mb(budget) }));
      return;
    }
    const plan = planBitrate({ targetBytes: budget, durationSec: o.duration });
    setBusy(true);
    setProgress(0);
    setStatus(u.loading);
    try {
      const out = await transcodeVideo(file, {
        videoKbps: plan.videoKbps,
        audioKbps: plan.audioKbps,
        onReady: () => setStatus(u.working),
        onProgress: setProgress,
      });
      const prev = result();
      if (prev) URL.revokeObjectURL(prev.url);
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: 'video/mp4' }));
      setResult({ bytes: out.byteLength, url });
      const saved = ((1 - out.byteLength / o.bytes) * 100).toFixed(0);
      const warn = plan.feasible ? '' : u.infeasibleWarn;
      setStatus(
        out.byteLength <= budget
          ? fmt(u.doneStatus, { size: mb(out.byteLength), pct: saved })
          : fmt(u.compressedTo, { size: mb(out.byteLength), warn }),
      );
    } catch (err) {
      setStatus(err instanceof Error ? fmt(u.failedWith, { message: err.message }) : u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={VideoPreview}>
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
            <label class="mb-2 block text-sm font-medium">{u.pickLabel}</label>
            <input
              type="file"
              accept="video/*"
              onChange={onPick}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <Show when={original()}>
              {(o) => (
                <p class="mt-2 text-xs text-muted">
                  {fmt(u.fileMeta, { name: fileName(), size: mb(o().bytes), seconds: o().duration.toFixed(0) })}
                </p>
              )}
            </Show>
          </div>

          <div>
            <p class="mb-2 text-sm font-medium">{u.targetLabel}</p>
            <SegmentedControl
              aria-label={u.targetLabel}
              options={TARGETS.map((t) => ({ value: t.value, label: u[t.labelKey] }))}
              value={target()}
              onChange={setTarget}
            />
          </div>

          <Button onClick={() => void run()} disabled={busy() || !original()}>
            {busy() ? u.working : u.action}
          </Button>

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
                  download={`compressed-${fileName() || 'video'}.mp4`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: mb(r().bytes) })}
                </a>
                <video src={r().url} controls class="max-h-80 w-full rounded border border-border" />
              </div>
            )}
          </Show>
        </div>
      </Show>
      <ToolContent route="video-compress" />
    </main>
  );
}
