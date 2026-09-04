import { createSignal, createMemo, onCleanup, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { targetSize } from '@core/target-size';
import { loadPdf, makePdfEncoder, type LoadedPdf } from '@core/pdf/compress';
import { summarise } from '@core/pdf/plan';

/**
 * Compress a PDF to an exact byte target.
 *
 * The outcome-driven control again: the user names the limit their form demands
 * ("Under 200 KB") and the target-size engine solves for the JPEG quality and
 * resolution, rather than offering a Low/Medium/High dropdown and letting them
 * discover the answer by being rejected.
 *
 * The honesty this tool owes the reader is unusually specific, so it is stated
 * up front rather than buried: reaching a hard byte target means re-rendering
 * pages as images, and a PDF that had selectable text loses it. We detect that
 * case and say so BEFORE compressing.
 */

// pdf.js parses in a worker and the pages are rasterised on a canvas; neither is
// optional, so there is no degraded path worth offering here.

const TARGETS = [
  { value: '100kb', labelKey: 'targetUnder100kb', bytes: 100 * 1024 },
  { value: '200kb', labelKey: 'targetUnder200kb', bytes: 200 * 1024 },
  { value: '500kb', labelKey: 'targetUnder500kb', bytes: 500 * 1024 },
  { value: '1mb', labelKey: 'targetUnder1mb', bytes: 1024 * 1024 },
] as const;

type TargetValue = (typeof TARGETS)[number]['value'];

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function PdfCompressor() {
  const { m, fmt } = useI18n();
  const tt = m.tools['pdf-compress'];
  const u = tt.ui;
  useSeo('pdf-compress');

  const [target, setTarget] = createSignal<TargetValue>('200kb');
  const [fileName, setFileName] = createSignal('');
  const [originalBytes, setOriginalBytes] = createSignal(0);
  const [loaded, setLoaded] = createSignal<LoadedPdf | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<{ bytes: number; url: string; note: string } | null>(null);

  const cleanup = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    loaded()?.close();
  };
  onCleanup(cleanup);

  const analysis = createMemo(() => loaded()?.analysis ?? null);

  const pagesLabel = (n: number) => (n === 1 ? u.pagesOne : fmt(u.pagesMany, { n }));

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    cleanup();
    setLoaded(null);
    setResult(null);
    setError('');
    setStatus(u.reading);
    setFileName(file.name);
    setOriginalBytes(file.size);
    setBusy(true);
    try {
      const doc = await loadPdf(file, (frac) => {
        const total = Math.max(1, Math.round(1 / Math.max(frac, 0.0001)));
        setStatus(fmt(u.readingPage, { n: Math.round(frac * total), total }));
      });
      setLoaded(doc);
      setStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // pdf.js reports encryption through a named error; a password prompt is
      // not something this tool can or should offer.
      setError(/password|encrypt/i.test(msg) ? u.encrypted : u.readError);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    const doc = loaded();
    if (!doc) {
      setStatus(u.chooseFirst);
      return;
    }
    const budget = TARGETS.find((t) => t.value === target())!.bytes;
    setBusy(true);
    setError('');
    setStatus(u.working);
    try {
      const r = await targetSize({
        encode: makePdfEncoder(doc),
        budgetBytes: budget,
        // Quality floors at 0.3 and resolution at 40% of the 200 DPI render
        // (80 DPI) — below that a scanned certificate stops being readable, and
        // an unreadable file that meets the byte limit is still a rejected
        // application.
        searchSpace: { quality: { min: 0.3, max: 0.92 }, scale: { min: 0.4, max: 1 } },
        strategy: 'binary',
      });

      const prev = result();
      if (prev) URL.revokeObjectURL(prev.url);
      const url = URL.createObjectURL(
        new Blob([r.output as BlobPart], { type: 'application/pdf' }),
      );
      const s = summarise(originalBytes(), r.bytes, r.withinBudget, r.params.scale);
      setResult({ bytes: r.bytes, url, note: '' });

      if (s.percentSmaller === null) {
        setStatus(fmt(u.grew, { size: kb(r.bytes) }));
      } else if (r.withinBudget) {
        setStatus(
          fmt(u.doneStatus, {
            size: kb(r.bytes),
            saved: fmt(u.savedFragment, { pct: s.percentSmaller }),
            dpi: s.dpi,
          }),
        );
      } else {
        setStatus(fmt(u.notReached, { target: kb(budget), size: kb(r.bytes), dpi: s.dpi }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : u.failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  const degraded = () => !evaluate(TOOL_CAPABILITIES['pdf-compress'], detectCapabilities()).fastPath;

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle}>{tt.heroNote}</ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium">{u.pickLabel}</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <Show when={analysis()}>
            {(a) => (
              <p class="mt-2 text-xs text-muted">
                {fmt(u.fileMeta, {
                  name: fileName(),
                  size: kb(originalBytes()),
                  pages: pagesLabel(a().pageCount),
                })}
              </p>
            )}
          </Show>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        {/* Stated before compressing, not after: this is the one real cost. */}
        <Show when={analysis()?.hasText}>
          <div class="rounded border border-border bg-surface p-3">
            <p class="text-sm font-semibold text-fg">{u.textWarningHeading}</p>
            <p class="mt-1 text-sm text-muted">{u.textWarning}</p>
          </div>
        </Show>

        <Show when={analysis()?.heavy}>
          <p class="text-xs text-muted">
            {fmt(u.heavyWarning, { n: analysis()!.pageCount })}
          </p>
        </Show>

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
          <p class="text-xs text-muted">{m.tools['image-compress'].ui.degraded}</p>
        </Show>

        <Button onClick={() => void run()} disabled={busy() || !loaded()}>
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
              <a
                href={r().url}
                download={`compressed-${fileName() || 'document.pdf'}`}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {fmt(u.download, { size: kb(r().bytes) })}
              </a>
              <p class="text-xs text-muted">{u.verifyHint}</p>
            </div>
          )}
        </Show>
      </div>

      <ToolContent route="pdf-compress" />
    </main>
  );
}
