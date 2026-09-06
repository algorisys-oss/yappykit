import { describe, it, expect } from 'vitest';
import { zip } from '../archive/zip';
import { readZipListing, describeZip } from './zip-read';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('readZipListing', () => {
  it('reads back what the writer wrote', () => {
    const archive = zip([
      { name: 'one.txt', bytes: bytes('hello') },
      { name: 'nested/two.txt', bytes: bytes('world!') },
    ]);
    const entries = readZipListing(archive);
    expect(entries.map((e) => e.name)).toEqual(['one.txt', 'nested/two.txt']);
    expect(entries.map((e) => e.sizeBytes)).toEqual([5, 6]);
  });

  it('is empty for an archive with nothing in it', () => {
    expect(readZipListing(zip([]))).toEqual([]);
  });

  it('reads names outside ASCII, which the writer flags as UTF-8', () => {
    const archive = zip([{ name: 'документ.txt', bytes: bytes('x') }]);
    expect(readZipListing(archive)[0]!.name).toBe('документ.txt');
  });

  it('refuses bytes that are not a ZIP rather than inventing entries', () => {
    expect(() => readZipListing(bytes('not a zip at all'))).toThrow();
  });
});

describe('describeZip', () => {
  const listing = (names: string[]) => names.map((name) => ({ name, sizeBytes: 1, compressedBytes: 1 }));

  it('recognises the office formats by what is inside them', () => {
    expect(describeZip(listing(['word/document.xml', 'docProps/core.xml'])).kind).toBe('office');
    expect(describeZip(listing(['xl/workbook.xml'])).kind).toBe('office');
    expect(describeZip(listing(['META-INF/container.xml', 'OEBPS/book.opf'])).kind).toBe('epub');
    expect(describeZip(listing(['photos/a.jpg'])).kind).toBe('archive');
  });

  it('reports the macro payload, which is the thing worth knowing', () => {
    const macro = describeZip(listing(['word/document.xml', 'word/vbaProject.bin']));
    expect(macro.hasMacros).toBe(true);
    expect(describeZip(listing(['word/document.xml'])).hasMacros).toBe(false);
  });

  it('points at the file that carries the author name', () => {
    expect(describeZip(listing(['docProps/core.xml'])).propsEntry).toBe('docProps/core.xml');
    expect(describeZip(listing(['word/document.xml'])).propsEntry).toBe('');
  });

  it('counts what is in the archive', () => {
    expect(describeZip(listing(['a', 'b', 'c'])).entryCount).toBe(3);
  });
});
