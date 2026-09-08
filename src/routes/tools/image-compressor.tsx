import { createSignal, Show, For, onMount, onCleanup } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ImagePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { zip, uniqueNames } from '@core/archive/zip';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
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

// Values and byte budgets are fixed; the LABELS come from the active locale.
const TARGETS = [
  { value: '100kb', labelKey: 'targetUnder100kb', bytes: 100 * 1024 },
  { value: '1mb', labelKey: 'targetUnder1mb', bytes: 1024 * 1024 },
  { value: 'whatsapp', labelKey: 'targetWhatsapp', bytes: 16 * 1024 * 1024 },
] as const;

type TargetValue = (typeof TARGETS)[number]['value'];

interface Compressed {
  name: string;
  url: string;
  bytes: number;
  originalBytes: number;
  withinBudget: boolean;
  note: string;
  /** Kept so the ZIP does not have to fetch its own blob URLs back. */
  output: Uint8Array;
}

/** The output is always a JPEG, so the name says so rather than lying. */
function compressedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}-compressed.jpg`;
}

const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

export default function ImageCompressor() {
  const { m, fmt } = useI18n();
  const tt = m.tools['image-compress'];
  const u = tt.ui;
  useSeo('image-compress');
  const byName = new Intl.Collator(undefined, { numeric: true });
  const [degraded, setDegraded] = createSignal(false);
  const [target, setTarget] = createSignal<TargetValue>('100kb');

  const [queue, setQueue] = createSignal<File[]>([]);
  const [results, setResults] = createSignal<Compressed[]>([]);
  const [archive, setArchive] = createSignal<{ url: string; bytes: number } | null>(null);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);

  onMount(() => setDegraded(!evaluate(TOOL_CAPABILITIES['image-compress'], detectCapabilities()).fastPath));

  const cleanup = () => {
    for (const r of results()) URL.revokeObjectURL(r.url);
    const a = archive();
    if (a) URL.revokeObjectURL(a.url);
    setResults([]);
    setArchive(null);
  };
  onCleanup(cleanup);

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const picked = [...(e.currentTarget.files ?? [])];
    // Clearing the input lets the same file be chosen again after a run.
    e.currentTarget.value = '';
    accept(picked);
  }

  usePasteImages((files) => accept(files));

  function accept(files: File[]) {
    if (files.length === 0) return;
    cleanup();
    setSkipped([]);
    setStatus('');
    setQueue([...queue(), ...files].sort((a, b) => byName.compare(a.name, b.name)));
  }

  async function run() {
    const files = queue();
    if (files.length === 0) {
      setStatus(u.chooseFirst);
      return;
    }
    cleanup();
    setSkipped([]);
    setBusy(true);
    const budget = TARGETS.find((t) => t.value === target())!.bytes;
    const done: Compressed[] = [];
    const failed: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setStatus(fmt(u.progress, { done: index + 1, total: files.length }));

        // Decoded, searched and released one at a time: holding every bitmap
        // would put a batch of phone photos straight into the memory ceiling.
        let decoded: DecodedImage | null = null;
        try {
          decoded = await decodeImage(file);
          const r = await targetSize({
            encode: makeEncoder(decoded, 'image/jpeg'),
            budgetBytes: budget,
            searchSpace: { quality: { min: 0.3, max: 0.95 }, scale: { min: 0.3, max: 1 } },
            strategy: 'binary',
          });
          const q = fmt(u.noteQuality, { pct: (r.params.quality * 100) | 0 });
          const sc = r.sacrifice.scaled ? fmt(u.noteScaled, { pct: (r.params.scale * 100) | 0 }) : '';
          const detail = `${q}${sc}`;
          done.push({
            name: compressedName(file.name),
            url: URL.createObjectURL(new Blob([r.output as BlobPart], { type: 'image/jpeg' })),
            bytes: r.bytes,
            originalBytes: file.size,
            withinBudget: r.withinBudget,
            note: r.withinBudget
              ? fmt(u.notePasses, { detail, n: r.iterations })
              : fmt(u.noteSmallest, { detail }),
            output: r.output,
          });
        } catch {
          failed.push(fmt(u.skipped, { name: file.name }));
        } finally {
          decoded?.close();
        }
      }

      setResults(done);
      setSkipped(failed);

      if (done.length > 1) {
        const bytes = zip(
          uniqueNames(done.map((d) => d.name)).map((name, i) => ({ name, bytes: done[i]!.output })),
        );
        setArchive({
          url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' })),
          bytes: bytes.byteLength,
        });
      }

      const totalAfter = done.reduce((n, d) => n + d.bytes, 0);
      const totalBefore = done.reduce((n, d) => n + d.originalBytes, 0);
      const saved = totalBefore
        ? fmt(u.savedFragment, { pct: (100 - (totalAfter / totalBefore) * 100).toFixed(0) })
        : '';
      setStatus(
        done.length === 0
          ? u.failed
          : done.length === 1 && done[0]!.withinBudget
            ? fmt(u.doneStatus, { size: kb(done[0]!.bytes), saved })
            : fmt(u.doneMany, { n: done.length, size: kb(totalAfter), saved }),
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
          <label class="mb-2 block text-sm font-medium" for="compress-files">
            {u.pickLabel}
          </label>
          <input
            id="compress-files"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHintMany}</p>
          <p class="mt-2 text-xs text-muted">{m.content.pasteHint}</p>
          <Show when={queue().length > 0}>
            <p class="mt-2 text-xs text-muted">
              {queue().map((f) => f.name).join(', ')}
            </p>
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

        <Button onClick={() => void run()} disabled={busy() || queue().length === 0}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={skipped().length > 0}>
          <ul class="list-none space-y-1 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            <For each={skipped()}>{(line) => <li>{line}</li>}</For>
          </ul>
        </Show>

        <Show when={archive()}>
          {(a) => (
            <a
              href={a().url}
              download="compressed-images.zip"
              class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
            >
              {fmt(u.downloadAll, { size: kb(a().bytes) })}
            </a>
          )}
        </Show>

        <Show when={results().length > 0}>
          <ul class="list-none space-y-3 p-0">
            <For each={results()}>
              {(r) => (
                <li class="flex flex-wrap items-start gap-3 rounded border border-border bg-surface p-3">
                  <img
                    src={r.url}
                    alt={u.previewAlt}
                    class="h-20 w-20 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-fg">{r.name}</span>
                    <span class="block text-xs text-muted">
                      {fmt(u.rowMeta, {
                        before: kb(r.originalBytes),
                        after: kb(r.bytes),
                        pct: (100 - (r.bytes / r.originalBytes) * 100).toFixed(0),
                      })}
                    </span>
                    <span class="mt-1 block text-xs text-muted">{r.note}</span>
                    <a
                      href={r.url}
                      download={r.name}
                      class="mt-2 inline-block text-xs font-medium text-accent no-underline"
                    >
                      {fmt(u.download, { size: kb(r.bytes) })}
                    </a>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>

      </div>
      <ToolContent route="image-compress" />
    </main>
  );
}
