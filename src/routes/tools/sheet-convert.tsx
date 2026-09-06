import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { SheetConvertPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { zip } from '@core/archive/zip';
import {
  detectDelimiter,
  parseCsvText,
  toCsvText,
  readWorkbook,
  rowsToXlsx,
  convertedName,
  directionFor,
  wouldExcelMangle,
  isFormulaInjection,
  type Delimiter,
  type SheetRows,
} from '@core/tabular/convert';

/**
 * CSV to Excel and back.
 *
 * The conversion is a library call. What the tool is actually for is the three
 * ways the result is wrong on somebody else's machine: the missing byte order
 * mark that turns every accent into mojibake, the leading zero Excel eats on
 * import, and the cell beginning with = that Excel runs as a formula.
 *
 * None of those are visible on the machine that did the converting, which is
 * why they are surfaced here before the download rather than discovered later.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function SheetConvert() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['sheet-convert'];
  const u = tt.ui;
  useSeo('sheet-convert');

  const [name, setName] = createSignal('');
  const [direction, setDirection] = createSignal<'toCsv' | 'toXlsx'>('toXlsx');
  const [sheets, setSheets] = createSignal<SheetRows[]>([]);
  const [delimiter, setDelimiter] = createSignal<Delimiter>(',');
  const [excelSafe, setExcelSafe] = createSignal(true);
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number; count: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  onCleanup(clearResult);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    clearResult();
    setError('');
    setBusy(true);
    try {
      const way = directionFor(file.name, file.type);
      setDirection(way);
      setName(file.name);
      if (way === 'toCsv') {
        setSheets(await readWorkbook(await file.arrayBuffer()));
      } else {
        const text = await file.text();
        const found = detectDelimiter(text);
        setDelimiter(found);
        setSheets([{ name: 'Sheet1', rows: parseCsvText(text, found) }]);
      }
      if (!sheets().length || !sheets().some((s) => s.rows.length)) setError(u.empty);
    } catch {
      setError(u.readError);
      setSheets([]);
    } finally {
      setBusy(false);
    }
  }

  const allCells = createMemo(() => sheets().flatMap((s) => s.rows.flat()));
  const fragile = createMemo(() => allCells().filter(wouldExcelMangle).length);
  const formulas = createMemo(() => allCells().filter(isFormulaInjection).length);
  const totalRows = createMemo(() => sheets().reduce((n, s) => n + s.rows.length, 0));

  async function run() {
    const list = sheets();
    if (!list.length) {
      setError(u.needFile);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    try {
      if (direction() === 'toXlsx') {
        const bytes = await rowsToXlsx(list[0]!.rows, 'Sheet1');
        setResult({
          url: URL.createObjectURL(
            new Blob([bytes as BlobPart], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          ),
          name: convertedName(name(), 'xlsx'),
          bytes: bytes.byteLength,
          count: 1,
        });
        return;
      }

      // One CSV per sheet: a workbook with a sheet per month is the normal
      // case, and dropping eleven of them silently would be data loss.
      const files = list.map((sheet) => ({
        name: convertedName(name(), 'csv', list.length > 1 ? sheet.name : undefined),
        bytes: new TextEncoder().encode(
          toCsvText(sheet.rows, { delimiter: delimiter(), bom: excelSafe() }),
        ),
      }));
      const single = files.length === 1;
      const out = single ? files[0]!.bytes : zip(files);
      setResult({
        url: URL.createObjectURL(
          new Blob([out as BlobPart], { type: single ? 'text/csv;charset=utf-8' : 'application/zip' }),
        ),
        name: single ? files[0]!.name : convertedName(name(), 'csv').replace(/\.csv$/, '-sheets.zip'),
        bytes: out.byteLength,
        count: files.length,
      });
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={SheetConvertPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="convert-file">
            {u.pickLabel}
          </label>
          <input
            id="convert-file"
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>
        <Show when={busy() && !sheets().length}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={sheets().length}>
          <>
            <p class="text-sm text-fg">
              {fmt(direction() === 'toCsv' ? u.willMakeCsv : u.willMakeXlsx, {
                name: name(),
                rows: totalRows(),
              })}
            </p>

            <Show when={sheets().length > 1}>
              <div>
                <h2 class="mb-2 text-sm font-medium">{u.sheetsHeading}</h2>
                <ul class="m-0 list-none space-y-1 p-0 text-xs">
                  <For each={sheets()}>
                    {(sheet) => (
                      <li class="rounded border border-border bg-surface px-3 py-2 text-fg">
                        {sheet.name} · {fmt(u.sheetRows, { n: sheet.rows.length })}
                      </li>
                    )}
                  </For>
                </ul>
                <p class="mt-2 text-xs text-muted">{u.sheetsNote}</p>
              </div>
            </Show>

            <Show when={direction() === 'toCsv'}>
              <div class="space-y-3">
                <div>
                  <label class="mb-2 block text-sm font-medium">{u.delimiterLabel}</label>
                  <SegmentedControl
                    aria-label={u.delimiterLabel}
                    value={delimiter()}
                    onChange={(v) => {
                      clearResult();
                      setDelimiter(v as Delimiter);
                    }}
                    options={[
                      { value: ',' as Delimiter, label: u.delimiterComma },
                      { value: ';' as Delimiter, label: u.delimiterSemicolon },
                      { value: '\t' as Delimiter, label: u.delimiterTab },
                    ]}
                  />
                  <p class="mt-2 text-xs text-muted">{u.delimiterNote}</p>
                </div>
                <label class="flex items-start gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={excelSafe()}
                    onChange={(e) => {
                      clearResult();
                      setExcelSafe(e.currentTarget.checked);
                    }}
                    class="mt-1"
                  />
                  <span>
                    {u.excelSafeLabel}
                    <span class="block text-xs text-muted">{u.excelSafeNote}</span>
                  </span>
                </label>
              </div>
            </Show>

            <Show when={direction() === 'toXlsx' && fragile()}>
              <p class="rounded border border-warning bg-warning-soft p-3 text-xs text-fg">
                {fmt(fragile() === 1 ? u.fragileOne : u.fragileMany, { n: fragile() })}
              </p>
            </Show>

            <Show when={formulas()}>
              <p class="rounded border border-warning bg-warning-soft p-3 text-xs text-fg">
                {fmt(formulas() === 1 ? u.formulaOne : u.formulaMany, { n: formulas() })}
              </p>
            </Show>

            <Button onClick={() => void run()} disabled={busy()}>
              {busy() ? u.working : direction() === 'toCsv' ? u.actionCsv : u.actionXlsx}
            </Button>
          </>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(r().count === 1 ? u.doneOne : u.doneMany, { n: r().count, size: kb(r().bytes) })}
              </p>
              <div>
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {r().count === 1 ? u.download : u.downloadAll}
                </a>
              </div>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="sheet-convert" />
    </main>
  );
}
