import { describe, it, expect } from 'vitest';
import { sniff, extensionMismatch, FORMATS } from './sniff';

const bytes = (...parts: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') out.push(p);
    else for (const ch of p) out.push(ch.charCodeAt(0));
  }
  // Pad to 32 so short fixtures still reach the deeper checks.
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};
const ftyp = (brand: string) => bytes(0, 0, 0, 0x20, 'ftyp', brand);

describe('sniff', () => {
  it('reads the formats a phone and a browser produce', () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
    expect(sniff(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    expect(sniff(bytes('GIF89a'))?.mime).toBe('image/gif');
    expect(sniff(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))?.mime).toBe('image/webp');
    expect(sniff(ftyp('avif'))?.mime).toBe('image/avif');
    expect(sniff(ftyp('heic'))?.mime).toBe('image/heic');
    expect(sniff(bytes('%PDF-1.7'))?.mime).toBe('application/pdf');
  });

  it('tells the ISO container formats apart by brand', () => {
    // They share the ftyp header; only the brand says photo or video.
    expect(sniff(ftyp('mif1'))?.mime).toBe('image/heic');
    expect(sniff(ftyp('isom'))?.mime).toBe('video/mp4');
    expect(sniff(ftyp('qt  '))?.mime).toBe('video/quicktime');
  });

  it('reads the archive and document containers', () => {
    expect(sniff(bytes('PK', 3, 4))?.mime).toBe('application/zip');
    expect(sniff(bytes('PK', 5, 6))?.mime).toBe('application/zip');
    expect(sniff(bytes(0x1f, 0x8b, 8))?.mime).toBe('application/gzip');
    expect(sniff(bytes('7z', 0xbc, 0xaf, 0x27, 0x1c))?.mime).toBe('application/x-7z-compressed');
    expect(sniff(bytes('Rar!', 0x1a, 7, 0))?.mime).toBe('application/vnd.rar');
  });

  it('reads audio and font containers', () => {
    expect(sniff(bytes('ID3'))?.mime).toBe('audio/mpeg');
    expect(sniff(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))?.mime).toBe('audio/wav');
    expect(sniff(bytes('OggS'))?.mime).toBe('audio/ogg');
    expect(sniff(bytes('fLaC'))?.mime).toBe('audio/flac');
    expect(sniff(bytes(0, 1, 0, 0, 0))?.mime).toBe('font/ttf');
    expect(sniff(bytes('OTTO'))?.mime).toBe('font/otf');
    expect(sniff(bytes('wOFF'))?.mime).toBe('font/woff');
    expect(sniff(bytes('wOF2'))?.mime).toBe('font/woff2');
  });

  it('does not mistake a RIFF container for the wrong payload', () => {
    expect(sniff(bytes('RIFF', 0, 0, 0, 0, 'AVI '))?.mime).toBe('video/x-msvideo');
    expect(sniff(bytes('RIFF', 0, 0, 0, 0, 'JUNK'))).toBeNull();
  });

  it('is null for bytes it does not recognise, rather than guessing', () => {
    expect(sniff(bytes(0x11, 0x22, 0x33, 0x44))).toBeNull();
    expect(sniff(new Uint8Array([]))).toBeNull();
    expect(sniff(new Uint8Array([0xff]))).toBeNull();
  });

  it('carries a name and an extension for every format it knows', () => {
    for (const f of Object.values(FORMATS)) {
      expect(f.format, f.mime).not.toBe('');
      expect(f.ext, f.mime).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe('extensionMismatch', () => {
  const jpeg = sniff(bytes(0xff, 0xd8, 0xff, 0xe0))!;
  const heic = sniff(ftyp('heic'))!;
  const zip = sniff(bytes('PK', 3, 4))!;

  it('is the headline finding: an iPhone photo wearing a .jpg name', () => {
    expect(extensionMismatch('holiday.jpg', heic)).toBe(true);
  });

  it('accepts the spellings of one format', () => {
    expect(extensionMismatch('a.jpg', jpeg)).toBe(false);
    expect(extensionMismatch('a.jpeg', jpeg)).toBe(false);
    expect(extensionMismatch('a.JPG', jpeg)).toBe(false);
    expect(extensionMismatch('a.heif', heic)).toBe(false);
  });

  it('knows the Office formats are zips, so a .docx is not lying', () => {
    for (const name of ['report.docx', 'sheet.xlsx', 'deck.pptx', 'book.epub', 'app.jar']) {
      expect(extensionMismatch(name, zip), name).toBe(false);
    }
  });

  it('claims nothing when there is no extension or no match', () => {
    expect(extensionMismatch('README', jpeg)).toBe(false);
    expect(extensionMismatch('a.jpg', null)).toBe(false);
  });
});
