import { createSignal, createMemo, Show, For } from 'solid-js';
import { DataTable, type ColumnDef } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { SpreadsheetPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { parseSpreadsheet, type Table } from '@core/tabular/parse';
import { diffTables, type DiffRow, type RowStatus } from '@core/tabular/diff';

/**
 * Spreadsheet Compare & Reconcile.
 *
 * Outcome-driven: pick two files and a key column, get "what's new, what's gone,
 * what changed" — not a raw unified diff. Parsing (SheetJS) and diffing run in
 * this tab; nothing is uploaded. Results render in zen's DataTable (TanStack
 * core) so large diffs sort and virtualize without freezing the page.
 */

const STATUS_CLASS: Record<RowStatus, string> = {
  added: 'bg-success-soft',
  removed: 'bg-danger-soft',
  changed: 'bg-accent-soft',
  unchanged: '',
};

export default function SpreadsheetCompare() {
  const { m, fmt } = useI18n();
  const tt = m.tools['spreadsheet-compare'];
  const u = tt.ui;
  useSeo('spreadsheet-compare');
  const [before, setBefore] = createSignal<Table | null>(null);
  const [after, setAfter] = createSignal<Table | null>(null);
  const [beforeName, setBeforeName] = createSignal('');
  const [afterName, setAfterName] = createSignal('');
  const [keyColumn, setKeyColumn] = createSignal<string>('');
  const [error, setError] = createSignal('');

  // Key options: columns present in both files (a sensible reconcile key).
  const keyOptions = createMemo(() => {
    const b = before();
    const a = after();
    if (!b || !a) return [];
    return b.headers.filter((h) => a.headers.includes(h));
  });

  const diff = createMemo(() => {
    const b = before();
    const a = after();
    const key = keyColumn();
    if (!b || !a || !key) return null;
    return diffTables(b, a, key);
  });

  async function pick(which: 'before' | 'after', e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setError('');
    try {
      const table = await parseSpreadsheet(file);
      if (which === 'before') {
        setBefore(table);
        setBeforeName(file.name);
      } else {
        setAfter(table);
        setAfterName(file.name);
      }
      // Default the key to the first shared column once both are loaded.
      const opts = keyOptions();
      if (!keyColumn() && opts[0]) setKeyColumn(opts[0]);
    } catch {
      setError(fmt(u.readError, { name: file.name }));
    }
  }

  const columns = createMemo<ColumnDef<DiffRow>[]>(() => {
    const d = diff();
    if (!d) return [];
    const statusCol: ColumnDef<DiffRow> = {
      id: 'status',
      header: u.changeColumn,
      cell: (ctx) => <StatusBadge status={ctx.row.original.status} />,
    };
    const dataCols: ColumnDef<DiffRow>[] = d.columns.map((col) => ({
      id: col,
      header: col,
      cell: (ctx) => {
        const row = ctx.row.original;
        const isChanged = row.changedColumns.includes(col);
        return (
          <span class={isChanged ? 'font-semibold text-accent' : ''}>{row.cells[col] ?? ''}</span>
        );
      },
    }));
    return [statusCol, ...dataCols];
  });

  return (
    <main class="mx-auto max-w-5xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={SpreadsheetPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <FilePicker label={u.originalLabel} name={beforeName()} onPick={(e) => void pick('before', e)} />
        <FilePicker label={u.updatedLabel} name={afterName()} onPick={(e) => void pick('after', e)} />
      </div>

      <Show when={error()}>
        <p class="mt-4 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
      </Show>

      <Show when={keyOptions().length > 0}>
        <div class="mt-6">
          <label class="mb-2 block text-sm font-medium" for="key-col">
            {u.keyLabel}
          </label>
          <select
            id="key-col"
            value={keyColumn()}
            onChange={(e) => setKeyColumn(e.currentTarget.value)}
            class="rounded border border-border bg-surface px-3 py-1.5 text-sm text-fg"
          >
            <For each={keyOptions()}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </div>
      </Show>

      <Show when={diff()}>
        {(d) => (
          <div class="mt-8 space-y-4">
            <div class="flex flex-wrap gap-2 text-sm">
              <Chip class="bg-success-soft">{fmt(u.summaryAdded, { n: d().summary.added })}</Chip>
              <Chip class="bg-danger-soft">{fmt(u.summaryRemoved, { n: d().summary.removed })}</Chip>
              <Chip class="bg-accent-soft">{fmt(u.summaryChanged, { n: d().summary.changed })}</Chip>
              <Chip class="bg-surface">{fmt(u.summaryUnchanged, { n: d().summary.unchanged })}</Chip>
            </div>
            <DataTable
              data={d().rows}
              columns={columns()}
              enableSorting
              enableGlobalFilter
              globalFilterPlaceholder={u.filterPlaceholder}
              enableVirtualization
              maxBodyHeight={480}
              stickyHeader
              rowClassName={(row) => STATUS_CLASS[row.original.status]}
              emptyMessage={u.emptyMessage}
            />
          </div>
        )}
      </Show>
      <ToolContent route="spreadsheet-compare" />
    </main>
  );
}

function FilePicker(props: {
  label: string;
  name: string;
  onPick: (e: Event & { currentTarget: HTMLInputElement }) => void;
}) {
  return (
    <div>
      <label class="mb-2 block text-sm font-medium">{props.label}</label>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv"
        onChange={props.onPick}
        class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
      />
      <Show when={props.name}>
        <p class="mt-2 text-xs text-muted">{props.name}</p>
      </Show>
    </div>
  );
}

function Chip(props: { class?: string; children: import('solid-js').JSX.Element }) {
  return (
    <span class={`rounded-full border border-border px-3 py-1 text-fg ${props.class ?? ''}`}>
      {props.children}
    </span>
  );
}

function StatusBadge(props: { status: RowStatus }) {
  const { m } = useI18n();
  const u = m.tools['spreadsheet-compare'].ui;
  const label: Record<RowStatus, string> = {
    added: u.statusAdded,
    removed: u.statusRemoved,
    changed: u.statusChanged,
    unchanged: u.statusUnchanged,
  };
  return <span class="text-xs font-medium uppercase text-muted">{label[props.status]}</span>;
}
