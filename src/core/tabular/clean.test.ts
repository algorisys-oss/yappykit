import { describe, it, expect } from 'vitest';
import { cleanTable, toCsv, maskValue, MASK } from './clean';
import type { Table } from './parse';

const table = (headers: string[], rows: string[][]): Table => ({
  headers,
  rows: rows.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))),
});

const NONE = { dropDuplicates: false, dropBlankRows: false, trimCells: false, maskColumns: [], dropColumns: [] };

describe('cleanTable', () => {
  it('changes nothing when nothing is asked for', () => {
    const t = table(['a', 'b'], [['1', '2'], ['1', '2']]);
    const r = cleanTable(t, NONE);
    expect(r.table.rows).toHaveLength(2);
    expect(r.removedDuplicates).toBe(0);
  });

  it('drops repeated rows and keeps the first of each', () => {
    const t = table(['id', 'name'], [['1', 'Ana'], ['2', 'Bo'], ['1', 'Ana'], ['3', 'Cy'], ['1', 'Ana']]);
    const r = cleanTable(t, { ...NONE, dropDuplicates: true });
    expect(r.table.rows.map((row) => row.id)).toEqual(['1', '2', '3']);
    expect(r.removedDuplicates).toBe(2);
  });

  it('treats rows as duplicates only when every cell matches', () => {
    const t = table(['id', 'name'], [['1', 'Ana'], ['1', 'Bo']]);
    const r = cleanTable(t, { ...NONE, dropDuplicates: true });
    expect(r.table.rows).toHaveLength(2);
  });

  it('drops rows that are entirely empty, and only those', () => {
    const t = table(['a', 'b'], [['1', ''], ['', ''], ['', '2'], ['   ', '  ']]);
    const r = cleanTable(t, { ...NONE, dropBlankRows: true });
    // A row of only whitespace is blank; a row with one value is not.
    expect(r.table.rows).toHaveLength(2);
    expect(r.removedBlanks).toBe(2);
  });

  it('trims the stray spaces that break every lookup', () => {
    const t = table(['name'], [['  Ana '], ['Bo']]);
    const r = cleanTable(t, { ...NONE, trimCells: true });
    expect(r.table.rows.map((row) => row.name)).toEqual(['Ana', 'Bo']);
    expect(r.trimmedCells).toBe(1);
  });

  it('trims before comparing, so padding does not hide a duplicate', () => {
    const t = table(['name'], [['Ana'], [' Ana ']]);
    const r = cleanTable(t, { ...NONE, trimCells: true, dropDuplicates: true });
    expect(r.table.rows).toHaveLength(1);
  });

  it('removes a column completely, header included', () => {
    const t = table(['id', 'salary', 'name'], [['1', '50000', 'Ana']]);
    const r = cleanTable(t, { ...NONE, dropColumns: ['salary'] });
    expect(r.table.headers).toEqual(['id', 'name']);
    expect(r.table.rows[0]).not.toHaveProperty('salary');
  });

  it('masks a column, keeping the shape of the sheet', () => {
    const t = table(['id', 'phone'], [['1', '9876543210'], ['2', '']]);
    const r = cleanTable(t, { ...NONE, maskColumns: ['phone'] });
    expect(r.table.headers).toEqual(['id', 'phone']);
    expect(r.table.rows[0]!.phone).toBe(MASK);
    expect(r.maskedCells).toBe(1);
  });

  it('leaves an empty cell empty when masking, rather than inventing a value', () => {
    const t = table(['phone'], [['']]);
    const r = cleanTable(t, { ...NONE, maskColumns: ['phone'] });
    expect(r.table.rows[0]!.phone).toBe('');
  });

  it('applies removal before masking, so a removed column is simply gone', () => {
    const t = table(['a'], [['x']]);
    const r = cleanTable(t, { ...NONE, dropColumns: ['a'], maskColumns: ['a'] });
    expect(r.table.headers).toEqual([]);
  });
});

describe('maskValue', () => {
  it('hides the value and its length, which is itself a clue', () => {
    expect(maskValue('9876543210')).toBe(MASK);
    expect(maskValue('a')).toBe(MASK);
    expect(maskValue('9876543210').length).toBe(maskValue('a').length);
  });

  it('leaves nothing where there was nothing', () => {
    expect(maskValue('')).toBe('');
    expect(maskValue('   ')).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header row and the values', () => {
    expect(toCsv(table(['a', 'b'], [['1', '2']]))).toBe('a,b\r\n1,2');
  });

  it('quotes a value containing a comma', () => {
    expect(toCsv(table(['a'], [['x,y']]))).toBe('a\r\n"x,y"');
  });

  it('doubles a quote inside a quoted value, as the format requires', () => {
    expect(toCsv(table(['a'], [['say "hi"']]))).toBe('a\r\n"say ""hi"""');
  });

  it('quotes a value containing a newline rather than breaking the row', () => {
    expect(toCsv(table(['a'], [['line1\nline2']]))).toBe('a\r\n"line1\nline2"');
  });

  it('writes just the headers for a sheet with no rows', () => {
    expect(toCsv(table(['a', 'b'], []))).toBe('a,b');
  });
});
