import { describe, it, expect } from 'vitest';
import {
  bytesSource,
  openFonts,
  readNames,
  sniffFormat,
  FontFormatError,
  type ByteSource,
} from './sfnt';
import { cmap4, cmapTable, collection, nameTable, sfnt, woff, woff2Stub } from './fixtures';

const NAMES = nameTable([
  { nameId: 1, value: 'Fixture Sans' },
  { nameId: 2, value: 'Bold' },
  { nameId: 4, value: 'Fixture Sans Bold' },
]);
const CMAP = cmapTable([{ platform: 3, encoding: 1, data: cmap4([{ start: 65, end: 90, delta: 0 }]) }]);

/**
 * A source that records what was actually pulled out of the file.
 *
 * Over bytesSource, not blobSource: jsdom's Blob implements neither
 * arrayBuffer() nor stream(), so the Blob path is exercised in a real browser
 * by tests/e2e/font-coverage.spec.ts instead. What is under test here is the read
 * pattern, which is the same either way.
 */
function counting(bytes: Uint8Array): ByteSource & { readBytes: number } {
  const inner = bytesSource(bytes);
  const wrapper = {
    readBytes: 0,
    size: inner.size,
    async read(offset: number, length: number) {
      const out = await inner.read(offset, length);
      wrapper.readBytes += out.length;
      return out;
    },
  };
  return wrapper;
}

describe('sniffFormat', () => {
  it('names each container by its signature', () => {
    expect(sniffFormat(sfnt({ cmap: CMAP }))).toBe('sfnt');
    expect(sniffFormat(sfnt({ cmap: CMAP }, 0x4f54544f))).toBe('sfnt');
    expect(sniffFormat(collection([sfnt({ cmap: CMAP })]))).toBe('collection');
    expect(sniffFormat(woff2Stub())).toBe('woff2');
  });

  it('does not mistake an arbitrary file for a font', () => {
    expect(sniffFormat(new TextEncoder().encode('%PDF-1.7'))).toBe('unknown');
    expect(sniffFormat(new Uint8Array(2))).toBe('unknown');
  });
});

describe('openFonts', () => {
  it('reads a table back exactly, without the alignment padding', async () => {
    const font = sfnt({ cmap: CMAP, name: NAMES });
    const [res] = await openFonts(bytesSource(font));
    expect(await res!.read('cmap')).toEqual(CMAP);
    expect(await res!.read('name')).toEqual(NAMES);
  });

  it('reports a table the font does not have as absent, rather than empty', async () => {
    const [res] = await openFonts(bytesSource(sfnt({ cmap: CMAP })));
    expect(res!.has('name')).toBe(false);
    expect(await res!.read('name')).toBeNull();
  });

  it('returns every font in a collection, each with its own tables', async () => {
    const a = sfnt({ cmap: CMAP, name: nameTable([{ nameId: 4, value: 'Member One' }]) });
    const b = sfnt({ cmap: CMAP, name: nameTable([{ nameId: 4, value: 'Member Two' }]) });
    const fonts = await openFonts(bytesSource(collection([a, b])));
    expect(fonts).toHaveLength(2);
    const names = await Promise.all(fonts.map(async (f) => readNames((await f.read('name'))!).fullName));
    expect(names).toEqual(['Member One', 'Member Two']);
  });

  it('inflates the tables of a WOFF', async () => {
    const bytes = await woff({ cmap: CMAP, name: NAMES });
    const [res] = await openFonts(bytesSource(bytes));
    expect(await res!.read('cmap')).toEqual(CMAP);
    expect(await res!.read('name')).toEqual(NAMES);
  });

  it('refuses a WOFF2 by name instead of failing obscurely', async () => {
    await expect(openFonts(bytesSource(woff2Stub()))).rejects.toMatchObject({
      code: 'woff2',
    });
  });

  it('refuses a file that is not a font at all', async () => {
    const err = await openFonts(bytesSource(new TextEncoder().encode('not a font'))).catch((e) => e);
    expect(err).toBeInstanceOf(FontFormatError);
    expect(err.code).toBe('unknown');
  });

  it('rejects a truncated font rather than reporting no glyph coverage', async () => {
    const font = sfnt({ cmap: CMAP, name: NAMES });
    await expect(openFonts(bytesSource(font.slice(0, 20)))).rejects.toMatchObject({
      code: 'damaged',
    });
  });

  /**
   * The scan reads a few hundred bytes per font out of files that are commonly
   * megabytes and occasionally tens of megabytes. Pulling whole files in would
   * be invisible on a laptop with 40 fonts and would exhaust memory on a machine
   * with 400, which is exactly the machine this tool is for.
   */
  it('reads only the directory, not the whole file', async () => {
    const filler = new Uint8Array(2_000_000);
    const src = counting(sfnt({ cmap: CMAP, name: NAMES, glyf: filler }));
    const [res] = await openFonts(src);
    await res!.read('cmap');
    expect(src.readBytes).toBeLessThan(4096);
  });
});

describe('readNames', () => {
  it('reads the Windows records', () => {
    expect(readNames(NAMES)).toEqual({
      family: 'Fixture Sans',
      style: 'Bold',
      fullName: 'Fixture Sans Bold',
    });
  });

  it('prefers the typographic family, which is the one a user recognises', () => {
    // Legacy name 1 splits large families across weights ("Roboto Condensed
    // Light"); name 16 is the family the font actually belongs to.
    const table = nameTable([
      { nameId: 1, value: 'Fixture Sans Light' },
      { nameId: 2, value: 'Regular' },
      { nameId: 16, value: 'Fixture Sans' },
      { nameId: 17, value: 'Light' },
    ]);
    expect(readNames(table)).toMatchObject({ family: 'Fixture Sans', style: 'Light' });
  });

  it('falls back to a Macintosh record when there is no Windows one', () => {
    const table = nameTable([{ nameId: 4, value: 'Mac Only', platform: 1 }]);
    expect(readNames(table).fullName).toBe('Mac Only');
  });

  it('builds a full name from the parts when the font omits it', () => {
    const table = nameTable([
      { nameId: 1, value: 'Fixture Sans' },
      { nameId: 2, value: 'Italic' },
    ]);
    expect(readNames(table).fullName).toBe('Fixture Sans Italic');
  });

  it('survives a name table with nothing usable in it', () => {
    expect(readNames(nameTable([]))).toEqual({ family: '', style: '', fullName: '' });
  });
});

describe('bytesSource', () => {
  it('reads a range out of the middle', async () => {
    const src = bytesSource(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(src.size).toBe(8);
    expect(await src.read(2, 3)).toEqual(new Uint8Array([3, 4, 5]));
  });

  it('returns what exists when a read runs off the end', async () => {
    const src = bytesSource(new Uint8Array([1, 2, 3]));
    expect(await src.read(2, 10)).toEqual(new Uint8Array([3]));
  });
});
