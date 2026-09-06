/**
 * Tidying a spreadsheet before it goes anywhere.
 *
 * Two jobs that turn out to be the same job. The first is hygiene: the
 * duplicate rows, blank rows and stray spaces that accumulate in any sheet that
 * has been exported, edited and pasted into more than once, and that quietly
 * break every lookup and every count made from it.
 *
 * The second is the reason it belongs here. Sharing a spreadsheet usually means
 * sharing more than the recipient needs: the salary column next to the names,
 * the phone numbers beside the order ids. Removing or masking a column before
 * sending is the same errand as stripping the GPS out of a photo, and it is
 * done the same way, on the device, before the file goes anywhere.
 *
 * Everything here is pure. The file is parsed elsewhere and written elsewhere.
 */
import type { Table } from './parse';

/**
 * Fixed width on purpose. Masking with one bullet per character would leak the
 * length, and a ten-character mask beside a nine-character one tells a reader
 * more than they should have.
 */
export const MASK = '••••••';

export interface CleanOptions {
  dropDuplicates: boolean;
  dropBlankRows: boolean;
  trimCells: boolean;
  /** Headers whose values are replaced with the mask. */
  maskColumns: string[];
  /** Headers removed entirely, values and all. */
  dropColumns: string[];
}

export interface CleanResult {
  table: Table;
  removedDuplicates: number;
  removedBlanks: number;
  trimmedCells: number;
  maskedCells: number;
}

/** A value with its content hidden, and its length hidden with it. */
export function maskValue(value: string): string {
  return value.trim() === '' ? '' : MASK;
}

export function cleanTable(table: Table, options: CleanOptions): CleanResult {
  const dropped = new Set(options.dropColumns);
  const headers = table.headers.filter((h) => !dropped.has(h));
  const masked = new Set(options.maskColumns.filter((h) => !dropped.has(h)));

  let trimmedCells = 0;
  let maskedCells = 0;
  let removedBlanks = 0;
  let removedDuplicates = 0;

  const seen = new Set<string>();
  const rows: Record<string, string>[] = [];

  for (const source of table.rows) {
    const row: Record<string, string> = {};
    for (const header of headers) {
      let value = source[header] ?? '';
      if (options.trimCells) {
        const trimmed = value.trim();
        if (trimmed !== value) trimmedCells++;
        value = trimmed;
      }
      row[header] = value;
    }

    // Blankness is judged on the real values, before masking turns them into
    // bullets: a masked row is not an empty one.
    if (options.dropBlankRows && headers.every((h) => (row[h] ?? '').trim() === '')) {
      removedBlanks++;
      continue;
    }

    if (options.dropDuplicates) {
      // JSON of the ordered values: cheap, and exact rather than fuzzy, which
      // is what "duplicate row" should mean.
      const key = JSON.stringify(headers.map((h) => row[h] ?? ''));
      if (seen.has(key)) {
        removedDuplicates++;
        continue;
      }
      seen.add(key);
    }

    for (const header of masked) {
      const before = row[header] ?? '';
      const after = maskValue(before);
      if (after !== before) maskedCells++;
      row[header] = after;
    }

    rows.push(row);
  }

  return { table: { headers, rows }, removedDuplicates, removedBlanks, trimmedCells, maskedCells };
}

/** RFC 4180: quote when the value contains a comma, a quote or a newline. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(table: Table): string {
  const lines = [table.headers.map(csvCell).join(',')];
  for (const row of table.rows) {
    lines.push(table.headers.map((h) => csvCell(row[h] ?? '')).join(','));
  }
  return lines.join('\r\n');
}

/** The cleaned sheet as an .xlsx, for people who came in with one. */
export async function toXlsx(table: Table): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const aoa = [table.headers, ...table.rows.map((row) => table.headers.map((h) => row[h] ?? ''))];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** What to call the tidied copy, so it is never mistaken for the original. */
export function cleanedName(name: string, extension: 'csv' | 'xlsx'): string {
  return `${name.replace(/\.(csv|xlsx?|tsv)$/i, '')}-cleaned.${extension}`;
}
