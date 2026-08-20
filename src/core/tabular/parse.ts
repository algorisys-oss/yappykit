/**
 * Tabular parse (SheetJS). Reads .csv / .xlsx / .xls into a simple
 * { headers, rows } shape. SheetJS is imported dynamically so its weight only
 * loads once the user actually selects a file — never on the landing page.
 * All parsing is in-tab; nothing is uploaded.
 */

export interface Table {
  headers: string[];
  /** Row objects keyed by header. Missing cells are ''. */
  rows: Record<string, string>[];
}

export async function parseSpreadsheet(file: Blob): Promise<Table> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return { headers: [], rows: [] };
  const sheet = wb.Sheets[first];
  if (!sheet) return { headers: [], rows: [] };

  // header:1 → array-of-arrays so we control header handling and stringify.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (aoa.length === 0) return { headers: [], rows: [] };

  const headers = (aoa[0] ?? []).map((h, i) => String(h ?? `col${i + 1}`).trim() || `col${i + 1}`);
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const raw = aoa[r] ?? [];
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = raw[i] == null ? '' : String(raw[i]);
    });
    rows.push(row);
  }
  return { headers, rows };
}
