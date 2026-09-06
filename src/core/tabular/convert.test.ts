import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  splitLine,
  wouldExcelMangle,
  isFormulaInjection,
  csvCell,
  toCsvText,
  parseCsvText,
  convertedName,
  directionFor,
  cellValue,
  rowsToXlsx,
  readWorkbook,
} from './convert';

describe('finding the delimiter', () => {
  it('picks the one that gives every line the same number of columns', () => {
    // Prose full of commas would win on a naive count; the semicolon is what
    // actually structures this file.
    const sample = 'name;note\nAlice;likes cats, dogs, and rain\nBob;a, b, c, d';
    expect(detectDelimiter(sample)).toBe(';');
  });

  it('finds a plain comma file', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('finds tabs', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('ignores a delimiter that only appears inside quotes', () => {
    expect(detectDelimiter('name;city\n"Smith; John";London\n"Doe; Jane";Paris')).toBe(';');
  });

  it('falls back to a comma rather than guessing wildly', () => {
    expect(detectDelimiter('')).toBe(',');
    expect(detectDelimiter('single-column\nvalues\nhere')).toBe(',');
  });
});

describe('splitting a line', () => {
  it('treats a quoted delimiter as data', () => {
    expect(splitLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('unescapes a doubled quote', () => {
    expect(splitLine('a,"she said ""hi""",b', ',')).toEqual(['a', 'she said "hi"', 'b']);
  });

  it('keeps empty fields', () => {
    expect(splitLine('a,,c', ',')).toEqual(['a', '', 'c']);
  });
});

describe('values Excel would silently change', () => {
  it('catches a leading zero, which is a postcode losing its meaning', () => {
    expect(wouldExcelMangle('01234')).toBe(true);
    expect(wouldExcelMangle('007')).toBe(true);
  });

  it('catches a number too long to survive a double', () => {
    // 16 digits or more becomes 1.23457E+15 and the original is unrecoverable.
    expect(wouldExcelMangle('1234567890123456')).toBe(true);
    expect(wouldExcelMangle('123456789012')).toBe(false);
  });

  it('catches the codes Excel reads as dates', () => {
    expect(wouldExcelMangle('SEPT1')).toBe(true);
    expect(wouldExcelMangle('MARCH1')).toBe(true);
    expect(wouldExcelMangle('3/4')).toBe(true);
    expect(wouldExcelMangle('1-2')).toBe(true);
  });

  it('leaves real numbers alone, or every formula downstream breaks', () => {
    expect(wouldExcelMangle('42')).toBe(false);
    expect(wouldExcelMangle('3.14')).toBe(false);
    expect(wouldExcelMangle('-5')).toBe(false);
    expect(wouldExcelMangle('')).toBe(false);
    expect(wouldExcelMangle('London')).toBe(false);
  });
});

describe('cells Excel would execute', () => {
  it('spots the formula prefixes', () => {
    expect(isFormulaInjection('=1+1')).toBe(true);
    expect(isFormulaInjection('+44 20 7946')).toBe(true);
    expect(isFormulaInjection('@SUM(A1)')).toBe(true);
    expect(isFormulaInjection('-2+3')).toBe(true);
  });

  it('does not flag ordinary text', () => {
    expect(isFormulaInjection('London')).toBe(false);
    expect(isFormulaInjection('42')).toBe(false);
    expect(isFormulaInjection('=')).toBe(false);
  });
});

describe('writing CSV', () => {
  it('quotes only what has to be quoted', () => {
    expect(csvCell('plain', ',')).toBe('plain');
    expect(csvCell('a,b', ',')).toBe('"a,b"');
    expect(csvCell('a;b', ',')).toBe('a;b');
    expect(csvCell('a;b', ';')).toBe('"a;b"');
  });

  it('doubles an embedded quote', () => {
    expect(csvCell('she said "hi"', ',')).toBe('"she said ""hi"""');
  });

  it('quotes a value with meaningful spaces so they survive', () => {
    expect(csvCell(' padded ', ',')).toBe('" padded "');
  });

  it('quotes a value containing a newline', () => {
    expect(csvCell('two\nlines', ',')).toBe('"two\nlines"');
  });

  it('uses CRLF, which is what RFC 4180 and Excel expect', () => {
    expect(toCsvText([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('adds a BOM when asked, because Excel needs it to read UTF-8', () => {
    const withBom = toCsvText([['café']], { bom: true });
    expect(withBom.charCodeAt(0)).toBe(0xfeff);
    // And the bytes really are a UTF-8 BOM, not a stray character.
    expect([...new TextEncoder().encode(withBom)].slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('leaves the BOM off when it is not asked for', () => {
    expect(toCsvText([['café']]).charCodeAt(0)).not.toBe(0xfeff);
  });

  it('writes with the delimiter it was given', () => {
    expect(toCsvText([['a', 'b']], { delimiter: ';' })).toBe('a;b');
  });
});

describe('reading CSV', () => {
  it('round-trips everything awkward', () => {
    const rows = [
      ['name', 'note'],
      ['Smith, John', 'said "hi"'],
      ['multi', 'two\nlines'],
      ['', ' padded '],
    ];
    expect(parseCsvText(toCsvText(rows), ',')).toEqual(rows);
  });

  it('strips a BOM rather than making it part of the first heading', () => {
    // Otherwise the first column is named "﻿name" and no lookup matches it.
    const parsed = parseCsvText(toCsvText([['name', 'city']], { bom: true }), ',');
    expect(parsed[0]).toEqual(['name', 'city']);
  });

  it('reads a file that does not end in a newline', () => {
    expect(parseCsvText('a,b\r\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles CRLF and LF alike', () => {
    expect(parseCsvText('a,b\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('naming and direction', () => {
  it('converts to the other format, not back to the same one', () => {
    expect(directionFor('report.xlsx')).toBe('toCsv');
    expect(directionFor('report.csv')).toBe('toXlsx');
    expect(directionFor('report.tsv')).toBe('toXlsx');
  });

  it('never hands back a name that would overwrite the original', () => {
    expect(convertedName('report.xlsx', 'csv')).toBe('report.csv');
    expect(convertedName('report.csv', 'xlsx')).toBe('report.xlsx');
  });

  it('names a sheet when a workbook has several', () => {
    expect(convertedName('book.xlsx', 'csv', 'Q1 Sales')).toBe('book-Q1 Sales.csv');
  });

  it('keeps a sheet name safe for a file system', () => {
    expect(convertedName('book.xlsx', 'csv', 'A/B: test')).toBe('book-AB test.csv');
  });
});

describe('what Excel is told a value is', () => {
  it('keeps real numbers as numbers, so formulas still work', () => {
    expect(cellValue('42')).toBe(42);
    expect(cellValue('-3.5')).toBe(-3.5);
  });

  it('keeps the fragile ones as text, which is what saves the leading zero', () => {
    expect(cellValue('01234')).toBe('01234');
    expect(cellValue('1234567890123456')).toBe('1234567890123456');
    expect(cellValue('SEPT1')).toBe('SEPT1');
  });

  it('leaves anything that is not a number alone', () => {
    expect(cellValue('London')).toBe('London');
    expect(cellValue('')).toBe('');
  });
});

describe('a real workbook round trip', () => {
  it('survives the journey with its awkward values intact', async () => {
    const rows = [
      ['code', 'count', 'city'],
      ['01234', '42', 'London'],
      ['SEPT1', '7', 'Paris'],
      ['1234567890123456', '0', 'Lisbon'],
    ];
    const bytes = await rowsToXlsx(rows, 'Data');
    const sheets = await readWorkbook(bytes);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.name).toBe('Data');
    // The whole point: the leading zero, the long number and the date-like code
    // all come back as they went in.
    expect(sheets[0]!.rows).toEqual(rows);
  });

  it('reads every sheet, not just the first', async () => {
    const XLSX = await import('xlsx');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['a'], ['1']]), 'Jan');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['b'], ['2']]), 'Feb');
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);

    const sheets = await readWorkbook(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Jan', 'Feb']);
  });

  it('trims a sheet name Excel would refuse', async () => {
    const bytes = await rowsToXlsx([['a']], 'A/B:C*D?E[F]G that is really quite a lot longer than Excel allows');
    const sheets = await readWorkbook(bytes);
    expect(sheets[0]!.name.length).toBeLessThanOrEqual(31);
    expect(sheets[0]!.name).not.toMatch(/[[\]:*?/\\]/);
  });
});
