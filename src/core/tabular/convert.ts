/**
 * Converting between CSV and Excel.
 *
 * The conversion itself is a library call. Everything that makes this worth
 * building is the handling of the four ways the result is wrong on somebody
 * else's machine, none of which are visible on the machine that made it.
 *
 * A UTF-8 CSV without a byte order mark opens as mojibake in Excel on Windows:
 * "café" becomes "cafÃ©". Excel guesses the ANSI code page unless the BOM tells
 * it otherwise. This is the single most common complaint about every CSV
 * exporter ever written, and three bytes fix it.
 *
 * Going the other way, Excel silently reinterprets what it reads. A postcode of
 * 01234 loses its zero, a sixteen-digit card number becomes 1.23457E+15, and a
 * product code of SEPT1 becomes a date in September. Writing those cells as text
 * rather than letting Excel guess is the difference between a converter and a
 * data-loss incident.
 *
 * And a cell that begins with =, +, - or @ is a formula to Excel, not a string,
 * which is a known attack on anyone who opens a spreadsheet built from data they
 * did not write.
 */

export type Delimiter = ',' | ';' | '\t';

export const DELIMITERS: readonly Delimiter[] = [',', ';', '\t'];

/**
 * Guess the delimiter by which one gives a consistent column count.
 *
 * Counting occurrences is not enough: prose full of commas beats a semicolon
 * file. The delimiter that splits every line into the same number of fields is
 * the one actually structuring the file, so consistency decides, and a tie goes
 * to whichever produced more columns.
 */
export function detectDelimiter(sample: string): Delimiter {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (!lines.length) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => splitLine(line, delimiter).length);
    const first = counts[0]!;
    if (first < 2) continue;
    const consistent = counts.every((n) => n === first);
    // Consistency is worth more than column count, which only breaks ties.
    const score = (consistent ? 1000 : 0) + first;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** Split one line, honouring RFC 4180 quotes so a quoted delimiter is data. */
export function splitLine(line: string, delimiter: Delimiter): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}

/**
 * Values Excel will change the meaning of if it is left to guess.
 *
 * Deliberately narrow. Marking everything as text would stop real numbers being
 * numbers, which breaks every formula in the receiving sheet, so this only
 * catches the cases where guessing loses information that cannot be recovered.
 */
export function wouldExcelMangle(value: string): boolean {
  if (!value) return false;
  // A leading zero on something otherwise numeric: postcodes, phone numbers.
  if (/^0\d+$/.test(value)) return true;
  // More digits than a double can hold exactly, so it becomes 1.23457E+15.
  if (/^\d{16,}$/.test(value)) return true;
  // Short codes Excel reads as dates: SEPT1, MARCH1, 3-4, 1/2.
  // Abbreviation or full name, longest alternative first so MARCH1 is not
  // matched as MAR and then abandoned when the digits fail to follow.
  if (
    /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\d+$/i.test(
      value,
    )
  )
    return true;
  if (/^\d{1,2}[-/]\d{1,2}$/.test(value)) return true;
  return false;
}

/**
 * A cell Excel would execute rather than display.
 *
 * A leading =, +, - or @ makes the cell a formula, which is how a spreadsheet
 * built from someone else's data runs their code on the machine that opens it.
 */
export function isFormulaInjection(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value) && value.length > 1;
}

/** Quote a field only when it needs it, per RFC 4180. */
export function csvCell(value: string, delimiter: Delimiter): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface CsvOptions {
  delimiter?: Delimiter;
  /**
   * Prepend a UTF-8 byte order mark. Without it Excel on Windows reads the file
   * as its ANSI code page and every accented character is wrong.
   */
  bom?: boolean;
}

/** Rows to CSV text. CRLF, because that is what RFC 4180 and Excel expect. */
export function toCsvText(rows: readonly (readonly string[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const body = rows.map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join('\r\n');
  return (options.bom ? '﻿' : '') + body;
}

/** Parse whole CSV text into rows, honouring quoted newlines. */
export function parseCsvText(text: string, delimiter: Delimiter): string[][] {
  const clean = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  // A file not ending in a newline still has a last row.
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** What to call the converted copy, so it never overwrites the original. */
export function convertedName(name: string, extension: 'csv' | 'xlsx', sheet?: string): string {
  const stem = name.replace(/\.(csv|tsv|xlsx?|txt)$/i, '') || 'sheet';
  const safe = sheet ? `-${sheet.replace(/[<>:"/\\|?*]/g, '').trim()}` : '';
  return `${stem}${safe}.${extension}`;
}

/** The direction a file implies: give it a CSV and it wants Excel, and back. */
export function directionFor(name: string, type = ''): 'toXlsx' | 'toCsv' {
  if (/\.(xlsx?|xlsm)$/i.test(name)) return 'toCsv';
  if (/sheet|excel/i.test(type)) return 'toCsv';
  return 'toXlsx';
}

export interface SheetRows {
  name: string;
  rows: string[][];
}

/**
 * Every sheet of a workbook, as text.
 *
 * Takes bytes rather than a Blob so it can be tested without a browser: Blob
 * has no arrayBuffer under jsdom, and a core function that cannot be tested
 * outside a browser is a core function that does not get tested.
 *
 * All of them, not just the first: a workbook with a sheet per month is the
 * normal case, and a converter that silently drops eleven of them has lost the
 * user's data without saying so. `raw: false` asks SheetJS for the formatted
 * text rather than the underlying serial number, so a date reads as the date
 * the author saw and not as 45324.
 */
export async function readWorkbook(bytes: ArrayBuffer | Uint8Array): Promise<SheetRows[]> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(bytes, { type: 'array', cellDates: true });
  return book.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<string[]>(book.Sheets[name]!, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }).map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
  }));
}

/**
 * A value as Excel should store it: a number when it is safely a number, and
 * text otherwise.
 *
 * This is where the leading zeros are saved. In an .xlsx the cell type is
 * explicit, so a value written as text stays text no matter what it looks like,
 * which is the whole reason converting to Excel beats renaming a CSV.
 */
export function cellValue(value: string): string | number {
  if (!value || wouldExcelMangle(value)) return value;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const n = Number(value);
  // Beyond this a double cannot represent the integer exactly.
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) return value;
  return n;
}

/** Rows to a one-sheet .xlsx, with the fragile values pinned as text. */
export async function rowsToXlsx(
  rows: readonly (readonly string[])[],
  sheetName = 'Sheet1',
): Promise<Uint8Array> {
  const XLSX = await import('xlsx');
  const aoa = rows.map((row) => row.map(cellValue));
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  // Excel refuses a sheet name over 31 characters or containing []:*?/\
  const safe = sheetName.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
  XLSX.utils.book_append_sheet(book, sheet, safe);
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
