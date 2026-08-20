import { describe, it, expect } from 'vitest';
import { stripMetadata, detectKind } from './strip';

// Build a tiny but structurally valid JPEG: SOI, an APP1/EXIF block, a DQT,
// then SOS + a scrap of entropy data + EOI.
function jpegWithExif(): Uint8Array {
  const exifPayload = [...'Exif\0\0GPS-SECRET'].map((c) => c.charCodeAt(0));
  const app1Len = exifPayload.length + 2; // + the 2 length bytes
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...exifPayload, // APP1 EXIF
    0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, // DQT (len 4, 2 data bytes)
    0xff, 0xda, 0x00, 0x04, 0x01, 0x00, // SOS header
    0x9a, 0xbc, // entropy data
    0xff, 0xd9, // EOI
  ]);
}

describe('detectKind', () => {
  it('recognises JPEG and PNG signatures', () => {
    expect(detectKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectKind(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectKind(Uint8Array.from([0x00, 0x01, 0x02]))).toBe('unknown');
  });
});

describe('stripMetadata (JPEG)', () => {
  it('removes the EXIF/GPS block but keeps image structure and pixels', () => {
    const input = jpegWithExif();
    const { output, kind, removedBytes, supported } = stripMetadata(input);

    expect(kind).toBe('jpeg');
    expect(supported).toBe(true);
    expect(removedBytes).toBeGreaterThan(0);

    // The secret GPS bytes are gone.
    const text = new TextDecoder('latin1').decode(output);
    expect(text).not.toContain('GPS-SECRET');

    // Structure preserved: still starts with SOI, ends with EOI, keeps the DQT
    // and the entropy scan bytes.
    expect([output[0], output[1]]).toEqual([0xff, 0xd8]);
    expect([output[output.length - 2], output[output.length - 1]]).toEqual([0xff, 0xd9]);
    expect(text).toContain('\x11\x22'); // DQT payload survived
    expect(Array.from(output).includes(0x9a) && Array.from(output).includes(0xbc)).toBe(true); // entropy survived
  });

  it('is idempotent — stripping already-clean output removes nothing more', () => {
    const once = stripMetadata(jpegWithExif()).output;
    const twice = stripMetadata(once);
    expect(twice.removedBytes).toBe(0);
    expect(Array.from(twice.output)).toEqual(Array.from(once));
  });
});

describe('stripMetadata (unsupported)', () => {
  it('leaves unknown formats untouched and flags unsupported', () => {
    const input = Uint8Array.from([1, 2, 3, 4, 5]);
    const r = stripMetadata(input);
    expect(r.supported).toBe(false);
    expect(r.removedBytes).toBe(0);
    expect(Array.from(r.output)).toEqual([1, 2, 3, 4, 5]);
  });
});
