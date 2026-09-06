import { createMemo, createSignal, onCleanup, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { PdfSplitPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, isPdf } from '../../lib/paste';
import { move } from '@core/list';
import { zip } from '@core/archive/zip';
import { readPdf, PdfReadError } from '@core/pdf/merge';
import {
  parsePageRanges,
  extractPages,
  splitToFiles,
  extractedName,
} from '@core/pdf/split';

/**
 * PDF splitter.
 *
 * The page list is the whole interface, in the notation a print dialog uses,
 * because that is what people already know and it expresses every job this tool
 * does: keeping pages, dropping pages and reordering them are all just a list.
 *
 * The text box owns the selection. The chips below it are a VIEW of what was
 * parsed, and their arrows rewrite the box rather than holding a second copy of
 * the state, so the two can never disagree about what is about to happen.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

interface Output {
  url: string;
  name: string;
  bytes: number;
  files: number;
}

export default function PdfSplitter() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['pdf-split'];
  const u = tt.ui;
  useSeo('pdf-split');

  const [source, setSource] = createSignal<{ name: string; pages: number; size: number; hasForm: boolean } | null>(null);
  const [spec, setSpec] = createSignal('');
  const [output, setOutput] = createSignal<Output | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  let bytes: Uint8Array | null = null;

  const clearOutput = () => {
    const o = output();
    if (o) URL.revokeObjectURL(o.url);
    setOutput(null);
  };
  onCleanup(clearOutput);

  /** What the box currently says, resolved against the document. */
  const parsed = createMemo(() => {
    const src = source();
    if (!src) return { pages: [] as number[], error: null };
    return parsePageRanges(spec(), src.pages);
  });

  const pagesLabel = (n: number) => (n === 1 ? u.pagesOne : fmt(u.pagesMany, { n }));

  const rangeError = () => {
    const src = source();
    const e = parsed().error;
    if (!src || !e) return '';
    if (e === 'empty') return u.errorEmpty;
    if (e === 'syntax') return u.errorSyntax;
    return fmt(u.errorRange, { pages: pagesLabel(src.pages) });
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) await accept(file);
  }

  usePasteFiles(isPdf, (files) => void accept(files[0]!));

  async function accept(file: File) {

    clearOutput();
    setError('');
    setSource(null);
    setBusy(true);
    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      const doc = await readPdf(raw, file.name);
      bytes = raw;
      setSource({ name: file.name, pages: doc.pageCount, size: file.size, hasForm: doc.hasFormFields });
      // Everything, in order: the honest starting point, and one edit away
      // from any other selection.
      setSpec(doc.pageCount > 1 ? `1-${doc.pageCount}` : '1');
    } catch (err) {
      bytes = null;
      setError(err instanceof PdfReadError && err.reason === 'encrypted' ? u.encrypted : u.unreadable);
    } finally {
      setBusy(false);
    }
  }

  /** Rewrite the box from a list of pages, which is what the chips edit. */
  const setPages = (pages: readonly number[]) => {
    clearOutput();
    setSpec(pages.join(','));
  };

  const run = async (mode: 'one' | 'each') => {
    const src = source();
    const pages = parsed().pages;
    if (!src || !bytes || pages.length === 0) return;

    clearOutput();
    setError('');
    setBusy(true);
    try {
      if (mode === 'one') {
        const out = await extractPages(bytes, pages);
        setOutput({
          url: URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' })),
          name: extractedName(src.name),
          bytes: out.byteLength,
          files: 1,
        });
      } else {
        const files = await splitToFiles(bytes, pages, src.name);
        const archive = zip(files);
        setOutput({
          url: URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' })),
          name: `${src.name.replace(/\.pdf$/i, '')}-pages.zip`,
          bytes: archive.byteLength,
          files: files.length,
        });
      }
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={PdfSplitPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="split-file">
            {u.pickLabel}
          </label>
          <input
            id="split-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
          <Show when={source()}>
            {(s) => (
              <p class="mt-2 text-xs text-muted">
                {fmt(u.sourceMeta, {
                  name: s().name,
                  pages: pagesLabel(s().pages),
                  size: kb(s().size),
                })}
              </p>
            )}
          </Show>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={busy() && !source()}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={source()}>
          {(s) => (
            <>
              <div>
                <label class="mb-2 block text-sm font-medium" for="split-range">
                  {u.rangeLabel}
                </label>
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    id="split-range"
                    type="text"
                    inputmode="numeric"
                    value={spec()}
                    placeholder={u.rangePlaceholder}
                    onInput={(e) => {
                      clearOutput();
                      setSpec(e.currentTarget.value);
                    }}
                    class="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 font-mono text-sm text-fg"
                  />
                  <button
                    type="button"
                    onClick={() => setSpec(s().pages > 1 ? `1-${s().pages}` : '1')}
                    class="cursor-pointer rounded border border-border bg-bg px-3 py-2 text-xs font-medium text-fg"
                  >
                    {u.rangeAll}
                  </button>
                </div>
                <p class="mt-2 text-xs text-muted">{fmt(u.rangeHint, { last: s().pages })}</p>
              </div>

              <Show when={rangeError()}>
                <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
                  {rangeError()}
                </p>
              </Show>

              <Show when={s().hasForm}>
                <p class="rounded border border-border bg-surface p-3 text-sm text-muted">
                  {u.formWarning}
                </p>
              </Show>

              <Show when={parsed().pages.length > 0}>
                <div>
                  <p class="mb-2 text-sm font-medium">{u.resultHeading}</p>
                  <p class="mb-2 text-xs text-muted">
                    {fmt(u.resultSummary, { pages: pagesLabel(parsed().pages.length) })}
                  </p>
                  <ul class="flex list-none flex-wrap gap-2 p-0">
                    <For each={parsed().pages}>
                      {(n, i) => (
                        <li class="flex items-center gap-1 rounded border border-border bg-surface ps-2 text-sm">
                          <span class="font-mono text-fg">{fmt(u.pageChip, { n })}</span>
                          <span class="flex">
                            <button
                              type="button"
                              aria-label={fmt(u.moveUp, { n })}
                              disabled={i() === 0}
                              onClick={() => setPages(move(parsed().pages, i(), i() - 1))}
                              class="cursor-pointer border-0 bg-transparent px-1.5 py-1.5 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={fmt(u.moveDown, { n })}
                              disabled={i() === parsed().pages.length - 1}
                              onClick={() => setPages(move(parsed().pages, i(), i() + 1))}
                              class="cursor-pointer border-0 bg-transparent px-1.5 py-1.5 text-xs text-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label={fmt(u.remove, { n })}
                              onClick={() => setPages(parsed().pages.filter((_, k) => k !== i()))}
                              class="cursor-pointer border-0 bg-transparent px-2 py-1.5 text-xs text-muted"
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <p class="mt-3 text-xs text-muted">{u.losslessNote}</p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <Button onClick={() => void run('one')} disabled={busy()}>
                    {busy() ? u.working : u.actionExtract}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void run('each')}
                    disabled={busy()}
                    class="cursor-pointer rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {u.actionSplit}
                  </button>
                </div>
              </Show>
            </>
          )}
        </Show>

        <Show when={output()}>
          {(o) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {o().files === 1
                  ? fmt(u.doneOne, { pages: pagesLabel(parsed().pages.length), size: kb(o().bytes) })
                  : fmt(u.doneMany, { n: o().files, size: kb(o().bytes) })}
              </p>
              <a
                href={o().url}
                download={o().name}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {o().files === 1
                  ? fmt(u.download, { size: kb(o().bytes) })
                  : u.downloadAll}
              </a>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="pdf-split" />
    </main>
  );
}
