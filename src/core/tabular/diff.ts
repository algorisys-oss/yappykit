/**
 * Spreadsheet reconcile — the outcome the user has in their head is "show me
 * new rows, removed rows, and what changed", not "unified vs split diff".
 *
 * Rows are matched by a KEY column (e.g. an id / SKU / email). Pure and
 * synchronous so it unit-tests trivially and can move into a worker unchanged.
 */
import type { Table } from './parse';

export type RowStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffRow {
  key: string;
  status: RowStatus;
  /** Merged view: for changed rows, values come from the "after" table. */
  cells: Record<string, string>;
  /** Header names whose value differs between before/after (changed rows only). */
  changedColumns: string[];
}

export interface DiffResult {
  keyColumn: string;
  columns: string[];
  rows: DiffRow[];
  summary: Record<RowStatus, number>;
}

function indexByKey(table: Table, keyColumn: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of table.rows) {
    const key = row[keyColumn];
    if (key == null || key === '') continue; // skip keyless rows
    map.set(key, row); // last wins on duplicate keys
  }
  return map;
}

/**
 * Compare `before` → `after`, matched on `keyColumn`.
 * Column set is the union of both headers (before order, then new after cols).
 */
export function diffTables(before: Table, after: Table, keyColumn: string): DiffResult {
  const columns = [...before.headers];
  for (const h of after.headers) if (!columns.includes(h)) columns.push(h);

  const beforeByKey = indexByKey(before, keyColumn);
  const afterByKey = indexByKey(after, keyColumn);

  const rows: DiffRow[] = [];
  const summary: Record<RowStatus, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  // Preserve after-table order for present rows; append removed rows at the end.
  const seen = new Set<string>();
  const emit = (key: string, status: RowStatus, cells: Record<string, string>, changed: string[]) => {
    rows.push({ key, status, cells, changedColumns: changed });
    summary[status] += 1;
    seen.add(key);
  };

  for (const [key, aRow] of afterByKey) {
    const bRow = beforeByKey.get(key);
    if (!bRow) {
      emit(key, 'added', fill(columns, aRow), []);
      continue;
    }
    const changed = columns.filter((c) => (bRow[c] ?? '') !== (aRow[c] ?? ''));
    emit(key, changed.length ? 'changed' : 'unchanged', fill(columns, aRow), changed);
  }
  for (const [key, bRow] of beforeByKey) {
    if (seen.has(key)) continue;
    emit(key, 'removed', fill(columns, bRow), []);
  }

  return { keyColumn, columns, rows, summary };
}

function fill(columns: string[], row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) out[c] = row[c] ?? '';
  return out;
}
