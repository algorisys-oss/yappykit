import { createSignal, Show, For, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { MetadataPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, anyFile } from '../../lib/paste';
import { readMetadata, type MetadataSummary } from '@core/metadata/read';
import { stripMetadata } from '@core/metadata/strip';
import { stripPdfMetadata } from '@core/metadata/strip-pdf';
import { inspectPdf } from '@core/inspect/pdf';

/**
 * Universal Metadata Cleaner.
 *
 * Shows what a photo is quietly carrying — location, camera, software, author —
 * then removes it losslessly (the pixels are untouched; only the metadata is
 * rewritten out). All in-tab, nothing uploaded. GPS is highlighted because
 * that's the field people most need to strip before posting.
 */

const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

export default function MetadataCleaner() {
  const { m: msg, fmt, parts } = useI18n();
  const tt = msg.tools['metadata-remove'];
  const u = tt.ui;
  useSeo('metadata-remove');
  const [fileName, setFileName] = createSignal('');
  const [isPdf, setIsPdf] = createSignal(false);
  const [meta, setMeta] = createSignal<MetadataSummary | null>(null);
  const [cleaned, setCleaned] = createSignal<{ url: string; removed: number; supported: boolean } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  let sourceBytes: Uint8Array | null = null;

  const cleanup = () => {
    const c = cleaned();
    if (c) URL.revokeObjectURL(c.url);
  };
  onCleanup(cleanup);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (file) await accept(file);
  }

  usePasteFiles(anyFile, (files) => void accept(files[0]!));

  async function accept(file: File) {
    cleanup();
    setCleaned(null);
    setError('');
    setMeta(null);
    setFileName(file.name);
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    setIsPdf(pdf);
    setBusy(true);
    try {
      sourceBytes = new Uint8Array(await file.arrayBuffer());
      if (pdf) {
        // A PDF carries its author in an information dictionary rather than in
        // EXIF, so it is read by the PDF reader and shown in the same table.
        const info = await inspectPdf(sourceBytes);
        setMeta({ fields: info.fields, hasGps: false, empty: info.fields.length === 0 });
      } else {
        setMeta(await readMetadata(file));
      }
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  async function strip() {
    if (!sourceBytes) return;
    if (isPdf()) {
      setBusy(true);
      try {
        const { output, removed } = await stripPdfMetadata(sourceBytes);
        cleanup();
        setCleaned({
          url: URL.createObjectURL(new Blob([output as BlobPart], { type: 'application/pdf' })),
          // Bytes removed is meaningless for a PDF, which is rewritten rather
          // than trimmed; the count of cleared fields is what to report.
          removed: removed.length,
          supported: true,
        });
      } catch {
        setError(u.readError);
      } finally {
        setBusy(false);
      }
      return;
    }
    const r = stripMetadata(sourceBytes);
    cleanup();
    const url = URL.createObjectURL(new Blob([r.output as BlobPart]));
    setCleaned({ url, removed: r.removedBytes, supported: r.supported });
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={MetadataPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="metadata-file">
            {u.pickLabel}
          </label>
          <input
            id="metadata-file"
            type="file"
            accept="image/jpeg,image/png,application/pdf,.pdf"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
          <Show when={fileName()}>
            <p class="mt-2 text-xs text-muted">{fileName()}</p>
          </Show>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={busy()}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={meta()}>
          {(m) => (
            <div class="space-y-4">
              <Show
                when={!m().empty}
                fallback={
                  <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg">
                    {u.alreadyClean}
                  </p>
                }
              >
                <Show when={m().hasGps}>
                  <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
                    <For each={parts(u.gpsWarning)}>
                      {(pt) => ('text' in pt ? <>{pt.text}</> : <strong>{u.gpsTerm}</strong>)}
                    </For>
                  </p>
                </Show>
                <div class="overflow-hidden rounded border border-border">
                  <table class="w-full text-sm">
                    <tbody>
                      <For each={m().fields}>
                        {(f) => (
                          <tr class="border-b border-border last:border-0">
                            <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{f.label}</td>
                            <td class={`px-3 py-2 ${f.sensitive ? 'font-semibold text-danger' : 'text-fg'}`}>
                              {f.value}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
                <Button onClick={() => void strip()} disabled={busy()}>{u.action}</Button>
              </Show>
            </div>
          )}
        </Show>

        <Show when={cleaned()}>
          {(c) => (
            <div class="space-y-2">
              <Show
                when={c().supported}
                fallback={
                  <p class="text-sm text-muted">
                    {u.unsupported}
                  </p>
                }
              >
                <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                  {isPdf()
                    ? u.removedPdf
                    : fmt(u.removed, {
                        extra: c().removed > 0 ? fmt(u.removedExtra, { size: kb(c().removed) }) : '',
                      })}
                </p>
                <a
                  href={c().url}
                  download={`clean-${fileName() || 'photo'}`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {u.download}
                </a>
              </Show>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="metadata-remove" />
    </main>
  );
}
