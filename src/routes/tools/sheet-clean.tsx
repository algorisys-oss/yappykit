import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button, Switch } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { SheetCleanPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, anyFile } from '../../lib/paste';
import { parseSpreadsheet, type Table } from '@core/tabular/parse';
import { cleanTable, toCsv, toXlsx, cleanedName, MASK } from '@core/tabular/clean';

/**
 * Spreadsheet cleanup.
 *
 * Hygiene and privacy in one pass, because they are the same errand: the sheet
 * you are about to send has duplicate rows AND a salary column the recipient
 * does not need. The preview shows the cleaned result rather than the original,
 * so the thing being checked is the thing being downloaded.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** Enough rows to judge the result without rendering a whole sheet into the DOM. */
const PREVIEW_ROWS = 8;

export default function SheetClean() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['sheet-clean'];
  const u = tt.ui;
  useSeo('sheet-clean');

  const [source, setSource] = createSignal<{ name: string; table: Table } | null>(null);
  const [dropDuplicates, setDropDuplicates] = createSignal(true);
  const [dropBlankRows, setDropBlankRows] = createSignal(true);
  const [trimCells, setTrimCells] = createSignal(true);
  const [maskColumns, setMaskColumns] = createSignal<string[]>([]);
  const [dropColumns, setDropColumns] = createSignal<string[]>([]);
  const [download, setDownload] = createSignal<{ url: string; name: string; bytes: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const clearDownload = () => {
    const d = download();
    if (d) URL.revokeObjectURL(d.url);
    setDownload(null);
  };
  onCleanup(clearDownload);

  /** The cleaned sheet, recomputed as the switches move. */
  const cleaned = createMemo(() => {
    const src = source();
    if (!src) return null;
    return cleanTable(src.table, {
      dropDuplicates: dropDuplicates(),
      dropBlankRows: dropBlankRows(),
      trimCells: trimCells(),
      maskColumns: maskColumns(),
      dropColumns: dropColumns(),
    });
  });

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) void accept(file);
  }

  usePasteFiles(anyFile, (files) => void accept(files[0]!));

  async function accept(file: File) {
    clearDownload();
    setError('');
    setSource(null);
    setMaskColumns([]);
    setDropColumns([]);
    setBusy(true);
    try {
      const table = await parseSpreadsheet(file);
      if (table.headers.length === 0) {
        setError(u.emptyFile);
        return;
      }
      setSource({ name: file.name, table });
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: () => string[], set: (v: string[]) => void) => (header: string) => {
    clearDownload();
    set(list().includes(header) ? list().filter((h) => h !== header) : [...list(), header]);
  };
  const toggleMask = toggle(maskColumns, setMaskColumns);
  const toggleDrop = toggle(dropColumns, setDropColumns);

  async function save(format: 'csv' | 'xlsx') {
    const src = source();
    const result = cleaned();
    if (!src || !result) return;
    clearDownload();
    setBusy(true);
    try {
      const bytes =
        format === 'csv'
          ? new TextEncoder().encode(toCsv(result.table))
          : await toXlsx(result.table);
      const type =
        format === 'csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      setDownload({
        url: URL.createObjectURL(new Blob([bytes as BlobPart], { type })),
        name: cleanedName(src.name, format),
        bytes: bytes.byteLength,
      });
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={SheetCleanPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="clean-file">
            {u.pickLabel}
          </label>
          <input
            id="clean-file"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={busy() && !source()}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={source() && cleaned()}>
          <>
              <div class="space-y-3">
                <p class="text-sm font-medium">{u.tidyHeading}</p>
                <label class="flex items-center gap-3 text-sm text-fg">
                  <Switch checked={dropDuplicates()} onChange={(v) => { clearDownload(); setDropDuplicates(v); }} />
                  {u.optDuplicates}
                </label>
                <label class="flex items-center gap-3 text-sm text-fg">
                  <Switch checked={dropBlankRows()} onChange={(v) => { clearDownload(); setDropBlankRows(v); }} />
                  {u.optBlankRows}
                </label>
                <label class="flex items-center gap-3 text-sm text-fg">
                  <Switch checked={trimCells()} onChange={(v) => { clearDownload(); setTrimCells(v); }} />
                  {u.optTrim}
                </label>
              </div>

              <div>
                <p class="mb-1 text-sm font-medium">{u.columnsHeading}</p>
                <p class="mb-3 text-xs text-muted">{u.columnsHint}</p>
                <ul class="list-none space-y-2 p-0">
                  <For each={source()!.table.headers}>
                    {(header) => (
                      <li class="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2">
                        <span
                          class={`text-sm ${dropColumns().includes(header) ? 'text-muted line-through' : 'text-fg'}`}
                        >
                          {header}
                        </span>
                        <span class="flex gap-2">
                          <button
                            type="button"
                            aria-pressed={maskColumns().includes(header)}
                            disabled={dropColumns().includes(header)}
                            onClick={() => toggleMask(header)}
                            class={`min-h-9 cursor-pointer rounded border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                              maskColumns().includes(header)
                                ? 'border-accent bg-accent text-accent-fg'
                                : 'border-border bg-bg text-fg'
                            }`}
                          >
                            {u.maskColumn}
                          </button>
                          <button
                            type="button"
                            aria-pressed={dropColumns().includes(header)}
                            onClick={() => toggleDrop(header)}
                            class={`min-h-9 cursor-pointer rounded border px-3 py-1 text-xs font-medium ${
                              dropColumns().includes(header)
                                ? 'border-danger bg-danger-soft text-fg'
                                : 'border-border bg-bg text-fg'
                            }`}
                          >
                            {u.dropColumn}
                          </button>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <p class="mt-2 text-xs text-muted">{fmt(u.maskNote, { mask: MASK })}</p>
              </div>

              <div>
                <p class="mb-2 text-sm font-medium">{u.previewHeading}</p>
                {/* Labelled counts rather than a sentence: a sentence has to
                    agree in number, and "trimmed 1 cells" is wrong in most of
                    the twelve languages this ships in. */}
                <dl class="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <For
                    each={[
                      [u.statRows, cleaned()!.table.rows.length],
                      [u.statDuplicates, cleaned()!.removedDuplicates],
                      [u.statBlanks, cleaned()!.removedBlanks],
                      [u.statTrimmed, cleaned()!.trimmedCells],
                    ] as const}
                  >
                    {([label, value]) => (
                      <span class="whitespace-nowrap">
                        <dt class="inline">{label}</dt>{' '}
                        <dd class="ms-0 inline font-medium text-fg">{value}</dd>
                      </span>
                    )}
                  </For>
                </dl>
                <div class="overflow-x-auto rounded border border-border">
                  <table class="w-full text-sm">
                    <thead>
                      <tr>
                        <For each={cleaned()!.table.headers}>
                          {(h) => (
                            <th class="whitespace-nowrap bg-surface px-3 py-2 text-start font-medium text-muted">
                              {h}
                            </th>
                          )}
                        </For>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={cleaned()!.table.rows.slice(0, PREVIEW_ROWS)}>
                        {(row) => (
                          <tr class="border-t border-border">
                            <For each={cleaned()!.table.headers}>
                              {(h) => <td class="whitespace-nowrap px-3 py-2 text-fg">{row[h]}</td>}
                            </For>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
                <Show when={cleaned()!.table.rows.length > PREVIEW_ROWS}>
                  <p class="mt-2 text-xs text-muted">
                    {fmt(u.previewMore, { n: cleaned()!.table.rows.length - PREVIEW_ROWS })}
                  </p>
                </Show>
              </div>

              <div class="flex flex-wrap gap-3">
                <Button onClick={() => void save('csv')} disabled={busy()}>
                  {u.downloadCsv}
                </Button>
                <button
                  type="button"
                  onClick={() => void save('xlsx')}
                  disabled={busy()}
                  class="cursor-pointer rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {u.downloadXlsx}
                </button>
              </div>
          </>
        </Show>

        <Show when={download()}>
          {(d) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(u.doneStatus, { name: d().name, size: kb(d().bytes) })}
              </p>
              <a
                href={d().url}
                download={d().name}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {u.download}
              </a>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="sheet-clean" />
    </main>
  );
}
