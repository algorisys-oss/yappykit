import { describe, it, expect } from 'vitest';
import { zip, uniqueNames } from './zip';

/**
 * The archive is read back with a reader written from the spec rather than from
 * the writer, because a writer checked against itself proves only that it is
 * self-consistent. The CRC is recomputed bit by bit for the same reason.
 */

const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);

/** Bit-by-bit CRC-32, no table — an independent check on the writer's. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface Read {
  name: string;
  bytes: Uint8Array;
  crc: number;
  method: number;
  utf8: boolean;
}

/** Walk the central directory and pull each entry out through its local header. */
function unzip(archive: Uint8Array): Read[] {
  let eocd = archive.length - 22;
  while (eocd >= 0 && u32(archive, eocd) !== 0x06054b50) eocd--;
  expect(eocd, 'no end-of-central-directory record').toBeGreaterThanOrEqual(0);

  const count = u16(archive, eocd + 10);
  const cdSize = u32(archive, eocd + 12);
  let at = u32(archive, eocd + 16);
  expect(u16(archive, eocd + 8), 'entry counts must agree').toBe(count);

  const out: Read[] = [];
  const cdStart = at;
  for (let i = 0; i < count; i++) {
    expect(u32(archive, at)).toBe(0x02014b50);
    const flags = u16(archive, at + 8);
    const nameLen = u16(archive, at + 28);
    const extraLen = u16(archive, at + 30);
    const commentLen = u16(archive, at + 32);
    const local = u32(archive, at + 42);

    expect(u32(archive, local), 'central directory points at a local header').toBe(0x04034b50);
    const lNameLen = u16(archive, local + 26);
    const lExtraLen = u16(archive, local + 28);
    const size = u32(archive, local + 22);
    const data = local + 30 + lNameLen + lExtraLen;

    out.push({
      name: new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLen)),
      bytes: archive.slice(data, data + size),
      crc: u32(archive, local + 14),
      method: u16(archive, local + 8),
      utf8: (flags & 0x0800) !== 0,
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  expect(at - cdStart, 'central directory size must match the record').toBe(cdSize);
  return out;
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe('zip', () => {
  it('round-trips names and contents', () => {
    const read = unzip(zip([{ name: 'a.txt', bytes: bytes('hello') }]));
    expect(read).toHaveLength(1);
    expect(read[0]!.name).toBe('a.txt');
    expect(new TextDecoder().decode(read[0]!.bytes)).toBe('hello');
  });

  it('stores rather than compresses, because images are already compressed', () => {
    const read = unzip(zip([{ name: 'a.bin', bytes: new Uint8Array([1, 2, 3]) }]));
    expect(read[0]!.method).toBe(0);
  });

  it('keeps several entries separate and correctly offset', () => {
    const input = [
      { name: 'one.txt', bytes: bytes('first') },
      { name: 'two.txt', bytes: bytes('the second one, longer') },
      { name: 'three.bin', bytes: new Uint8Array(300).fill(7) },
    ];
    const read = unzip(zip(input));
    expect(read.map((r) => r.name)).toEqual(input.map((i) => i.name));
    for (let i = 0; i < input.length; i++) {
      // Compared as plain arrays: jsdom's TextEncoder returns a Uint8Array
      // from a different realm, which toEqual will not match structurally.
      expect([...read[i]!.bytes], input[i]!.name).toEqual([...input[i]!.bytes]);
    }
  });

  it('writes a CRC an independent implementation agrees with', () => {
    const payload = new Uint8Array(1024).map((_, i) => (i * 31) & 0xff);
    const read = unzip(zip([{ name: 'x', bytes: payload }]));
    expect(read[0]!.crc).toBe(crc32(payload));
  });

  it('flags names as UTF-8 and encodes them that way', () => {
    const read = unzip(zip([{ name: 'reçu-签证.jpg', bytes: bytes('x') }]));
    expect(read[0]!.name).toBe('reçu-签证.jpg');
    expect(read[0]!.utf8).toBe(true);
  });

  it('handles an empty file', () => {
    const read = unzip(zip([{ name: 'empty', bytes: new Uint8Array(0) }]));
    expect(read[0]!.bytes).toHaveLength(0);
    expect(read[0]!.crc).toBe(0);
  });

  it('writes a valid empty archive', () => {
    const empty = zip([]);
    expect(empty).toHaveLength(22);
    expect(unzip(empty)).toEqual([]);
  });

  it('is deterministic, so the same batch produces the same file', () => {
    const input = [{ name: 'a', bytes: bytes('one') }, { name: 'b', bytes: bytes('two') }];
    expect(zip(input)).toEqual(zip(input));
  });
});

describe('uniqueNames', () => {
  it('leaves distinct names alone', () => {
    expect(uniqueNames(['a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
  });

  it('numbers collisions without losing the extension', () => {
    expect(uniqueNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-2.jpg', 'a-3.jpg']);
  });

  it('handles a name with no extension', () => {
    expect(uniqueNames(['scan', 'scan'])).toEqual(['scan', 'scan-2']);
  });

  it('does not collide with a name that already looks numbered', () => {
    expect(uniqueNames(['a.jpg', 'a-2.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a-2.jpg', 'a-3.jpg']);
  });

  it('treats a dotfile as a name, not an extension', () => {
    expect(uniqueNames(['.env', '.env'])).toEqual(['.env', '.env-2']);
  });
});
