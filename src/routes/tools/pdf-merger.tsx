import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { PdfMergePreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { readPdf, mergePdfs, move, mergedName, PdfReadError, type PdfSource } from '@core/pdf/merge';

/**
 * Combine several PDFs into one.
 *
 * No capability gate: pdf-lib is plain JavaScript, so unlike every other tool
 * here this one needs no WASM, worker, canvas or codec. There is nothing to
 * degrade to and nothing to warn about.
 *
 * The only control is the order of the documents, which is the whole job. A
 * rejected file (encrypted, or not a PDF) never blocks the others — it is
 * listed with the reason and the rest of the batch still merges.
 */

interface Item {
  name: string;
  sizeBytes: number;
  source: PdfSource;
}

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function PdfMerger() {
  const { m, fmt } = useI18n();
  const tt = m.tools['pdf-merge'];
  const u = tt.ui;
  useSeo('pdf-merge');

  const [items, setItems] = createSignal<Item[]>([]);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [result, setResult] = createSignal<{ url: string; bytes: number; pages: number } | null>(null);

  const revoke = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(revoke);

  const totalPages = createMemo(() => items().reduce((n, it) => n + it.source.pageCount, 0));

  /** Any edit to the list invalidates a merged file built from the old one. */
  const edit = (next: Item[]) => {
    revoke();
    setResult(null);
    setStatus('');
    setItems(next);
  };

  const pagesLabel = (n: number) => (n === 1 ? u.pagesOne : fmt(u.pagesMany, { n }));

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    // Clearing the input lets the same file be added again after it was removed.
    e.currentTarget.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setError('');
    setSkipped([]);
    setStatus(u.reading);
    const added: Item[] = [];
    const rejected: string[] = [];
    try {
      for (const file of files) {
        try {
          const source = await readPdf(new Uint8Array(await file.arrayBuffer()), file.name);
          added.push({ name: file.name, sizeBytes: file.size, source });
        } catch (err) {
          const reason = err instanceof PdfReadError ? err.reason : 'unreadable';
          rejected.push(fmt(reason === 'encrypted' ? u.encrypted : u.unreadable, { name: file.name }));
        }
      }
      edit([...items(), ...added]);
      setSkipped(rejected);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  const shift = (index: number, to: number) => edit(move(items(), index, to));
  const drop = (index: number) => edit(items().filter((_, i) => i !== index));

  async function run() {
    const list = items();
    setBusy(true);
    setError('');
    setStatus(u.working);
    try {
      const bytes = await mergePdfs(list.map((it) => it.source));
      revoke();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setResult({ url, bytes: bytes.byteLength, pages: totalPages() });
      setStatus(fmt(u.doneStatus, { pages: totalPages(), size: kb(bytes.byteLength) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : u.failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={PdfMergePreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="pdf-merge-files">
            {u.pickLabel}
          </label>
          <input
            id="pdf-merge-files"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={skipped().length > 0}>
          <ul class="list-none space-y-1 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            <For each={skipped()}>{(line) => <li>{line}</li>}</For>
          </ul>
        </Show>

        <Show when={items().length > 0}>
          <div>
            <p class="mb-2 text-sm font-medium">{u.listHeading}</p>
            <ol class="list-none space-y-2 p-0">
              <For each={items()}>
                {(item, i) => (
                  <li class="flex items-center gap-3 rounded border border-border bg-surface p-3">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                      {i() + 1}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-fg">{item.name}</span>
                      <span class="block text-xs text-muted">
                        {fmt(u.rowMeta, {
                          pages: pagesLabel(item.source.pageCount),
                          size: kb(item.sizeBytes),
                        })}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={fmt(u.moveUp, { name: item.name })}
                        disabled={i() === 0}
                        onClick={() => shift(i(), i() - 1)}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        aria-label={fmt(u.moveDown, { name: item.name })}
                        disabled={i() === items().length - 1}
                        onClick={() => shift(i(), i() + 1)}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        aria-label={fmt(u.remove, { name: item.name })}
                        onClick={() => drop(i())}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-danger"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </span>
                  </li>
                )}
              </For>
            </ol>
            <p class="mt-2 text-xs text-muted">
              {fmt(u.summary, { files: items().length, pages: totalPages() })}
            </p>
          </div>
        </Show>

        {/* Stated before merging, not after: this is the one thing a merge costs. */}
        <Show when={items().some((it) => it.source.hasFormFields)}>
          <div class="rounded border border-border bg-surface p-3">
            <p class="text-sm font-semibold text-fg">{u.formWarningHeading}</p>
            <p class="mt-1 text-sm text-muted">{u.formWarning}</p>
          </div>
        </Show>

        {/* Says why the button is dim, rather than leaving it dim and unexplained. */}
        <Show when={items().length === 1}>
          <p class="text-xs text-muted">{u.needTwo}</p>
        </Show>

        <p class="text-xs text-muted">{u.losslessNote}</p>

        <Button onClick={() => void run()} disabled={busy() || items().length < 2}>
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
                download={mergedName(items().map((it) => it.name))}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {fmt(u.download, { size: kb(r().bytes) })}
              </a>
              <p class="text-xs text-muted">{u.verifyHint}</p>
            </div>
          )}
        </Show>
      </div>

      <ToolContent route="pdf-merge" />
    </main>
  );
}
