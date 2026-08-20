import { createSignal, Show, onMount, onCleanup } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ImagePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate, type CapabilitySpec } from '@core/capability';
import { targetSize } from '@core/target-size';
import { decodeImage, makeEncoder, type DecodedImage } from '@core/image/canvas-codec';

/**
 * Exact-Size Image Compressor.
 *
 * Real, on-device compression: the user picks an image, chooses an OUTCOME
 * ("Under 100 KB"), and the target-size engine binary-searches Canvas
 * `toBlob` quality (then dimensions) until the output fits. Nothing is uploaded.
 *
 * Canvas is the ship-first codec; the WASM codecs (MozJPEG/WebP/AVIF) will slot
 * in behind the same `encode(params)` interface later, in a worker.
 */

// Canvas encoding is universally available; createImageBitmap/OffscreenCanvas
// are fast-path niceties the tool degrades without.
const SPEC: CapabilitySpec = {
  required: [],
  preferred: ['createImageBitmap', 'offscreenCanvas'],
};

// Values and byte budgets are fixed; the LABELS come from the active locale.
const TARGETS = [
  { value: '100kb', labelKey: 'targetUnder100kb', bytes: 100 * 1024 },
  { value: '1mb', labelKey: 'targetUnder1mb', bytes: 1024 * 1024 },
  { value: 'whatsapp', labelKey: 'targetWhatsapp', bytes: 16 * 1024 * 1024 },
] as const;

type TargetValue = (typeof TARGETS)[number]['value'];

const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

export default function ImageCompressor() {
  const { m, fmt } = useI18n();
  const tt = m.tools['image-compress'];
  const u = tt.ui;
  useSeo('image-compress');
  const [degraded, setDegraded] = createSignal(false);
  const [target, setTarget] = createSignal<TargetValue>('100kb');

  const [fileName, setFileName] = createSignal<string>('');
  const [original, setOriginal] = createSignal<{ bytes: number; url: string } | null>(null);
  const [result, setResult] = createSignal<{ bytes: number; url: string; note: string } | null>(null);
  const [status, setStatus] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);
  const [ready, setReady] = createSignal(false); // image decoded and encodable

  let decoded: DecodedImage | null = null;

  onMount(() => setDegraded(!evaluate(SPEC, detectCapabilities()).fastPath));

  const cleanup = () => {
    const o = original();
    const r = result();
    if (o) URL.revokeObjectURL(o.url);
    if (r) URL.revokeObjectURL(r.url);
    decoded?.close();
    decoded = null;
  };
  onCleanup(cleanup);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    cleanup();
    setReady(false);
    setResult(null);
    setStatus('');
    setFileName(file.name);
    setOriginal({ bytes: file.size, url: URL.createObjectURL(file) });
    try {
      decoded = await decodeImage(file);
      setReady(true);
    } catch {
      decoded = null;
      setStatus(u.readError);
    }
  }

  async function run() {
    if (!decoded) {
      setStatus(u.chooseFirst);
      return;
    }
    const budget = TARGETS.find((t) => t.value === target())!.bytes;
    setBusy(true);
    setStatus(u.working);
    try {
      const r = await targetSize({
        encode: makeEncoder(decoded, 'image/jpeg'),
        budgetBytes: budget,
        searchSpace: { quality: { min: 0.3, max: 0.95 }, scale: { min: 0.3, max: 1 } },
        strategy: 'binary',
      });
      const prev = result();
      if (prev) URL.revokeObjectURL(prev.url);
      const url = URL.createObjectURL(new Blob([r.output as BlobPart], { type: 'image/jpeg' }));
      const q = fmt(u.noteQuality, { pct: (r.params.quality * 100) | 0 });
      const sc = r.sacrifice.scaled ? fmt(u.noteScaled, { pct: (r.params.scale * 100) | 0 }) : '';
      const detail = `${q}${sc}`;
      setResult({
        bytes: r.bytes,
        url,
        note: r.withinBudget
          ? fmt(u.notePasses, { detail, n: r.iterations })
          : fmt(u.noteSmallest, { detail }),
      });
      const o = original();
      const saved = o
        ? fmt(u.savedFragment, { pct: (100 - (r.bytes / o.bytes) * 100).toFixed(0) })
        : '';
      setStatus(
        r.withinBudget
          ? fmt(u.doneStatus, { size: kb(r.bytes), saved })
          : fmt(u.notReached, { size: kb(r.bytes) }),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ImagePreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium">{u.pickLabel}</label>
          <input
            type="file"
            accept="image/*"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <Show when={original()}>
            {(o) => (
              <p class="mt-2 text-xs text-muted">
                {fileName()}, {kb(o().bytes)}
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

        <Show when={degraded()}>
          <p class="text-xs text-muted">{u.degraded}</p>
        </Show>

        <Button onClick={() => void run()} disabled={busy() || !ready()}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <a
                  href={r().url}
                  download={`compressed-${fileName() || 'image'}.jpg`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.download, { size: kb(r().bytes) })}
                </a>
                <span class="text-xs text-muted">{r().note}</span>
              </div>
              <img src={r().url} alt={u.previewAlt} class="max-h-80 rounded border border-border" />
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="image-compress" />
    </main>
  );
}
