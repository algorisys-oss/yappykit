import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

/**
 * Fixtures the browser specs can build without an image library.
 *
 * Every one of these tools takes a picture and gives one back, so the specs
 * need images whose exact pixels are known in advance: an assertion like "the
 * crop is entirely green" is only worth making if the fixture's green is a
 * number this file chose. Encoding PNG by hand is a few dozen lines and removes
 * a dependency from the test path, which matters because a fixture library that
 * quietly recompresses would make these assertions lie.
 *
 * screenshot-stitch.spec.ts carries its own copy of the encoder, bound to that
 * spec's fixed width. It is left alone deliberately: folding it onto this one
 * is a tidy-up, not part of covering the tools that had no coverage at all.
 */

export type Rgb = [number, number, number];

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf: Buffer) => {
    let c = -1;
    for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** A PNG of any size from raw RGBA. Lossless, so the pixels come back exact. */
export function png(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** RGBA where `colour(x, y)` decides every pixel. */
export function paint(
  width: number,
  height: number,
  colour: (x: number, y: number) => Rgb,
): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colour(x, y);
      const at = (y * width + x) * 4;
      out[at] = r;
      out[at + 1] = g;
      out[at + 2] = b;
      out[at + 3] = 255;
    }
  }
  return out;
}

export function pngOf(
  width: number,
  height: number,
  colour: (x: number, y: number) => Rgb,
): Buffer {
  return png(width, height, paint(width, height, colour));
}

export interface ZipEntry {
  name: string;
  bytes: Buffer;
}

/**
 * Read a ZIP this app wrote.
 *
 * Deliberately only handles STORED entries, which is all src/core/archive/zip
 * produces. If it ever starts compressing, this throws rather than returning
 * something plausible, because a spec that silently reads the wrong bytes is
 * worse than one that fails.
 */
export function unzip(buffer: Buffer): ZipEntry[] {
  const out: ZipEntry[] = [];
  let at = 0;
  while (at + 30 <= buffer.length && buffer.readUInt32LE(at) === 0x04034b50) {
    const method = buffer.readUInt16LE(at + 8);
    if (method !== 0) throw new Error(`zip entry is compressed (method ${method})`);
    const size = buffer.readUInt32LE(at + 18);
    const nameLen = buffer.readUInt16LE(at + 26);
    const extraLen = buffer.readUInt16LE(at + 28);
    const nameAt = at + 30;
    const dataAt = nameAt + nameLen + extraLen;
    out.push({
      name: buffer.toString('utf8', nameAt, nameAt + nameLen),
      bytes: buffer.subarray(dataAt, dataAt + size),
    });
    at = dataAt + size;
  }
  return out;
}

export interface Measured {
  width: number;
  height: number;
  /** Pixels read back, in the order the `points` were given. */
  pixels: Rgb[];
}

/**
 * Decode an image in the browser under test and read pixels out of it.
 *
 * The decoding happens in the page rather than in node on purpose: it is the
 * same decoder the tool used, so a spec cannot pass because node and the
 * browser disagree about a format.
 */
export async function measure(
  page: Page,
  bytes: Buffer,
  points: readonly [number, number][] = [],
): Promise<Measured> {
  return page.evaluate(
    async ({ b64, points }) => {
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const bitmap = await createImageBitmap(new Blob([buf]));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const read = points.map(([x, y]) => {
        const px = ctx.getImageData(x < 0 ? bitmap.width + x : x, y < 0 ? bitmap.height + y : y, 1, 1).data;
        return [px[0]!, px[1]!, px[2]!] as [number, number, number];
      });
      return { width: bitmap.width, height: bitmap.height, pixels: read };
    },
    { b64: bytes.toString('base64'), points: points as [number, number][] },
  );
}

/** The bytes of a download, for handing to `measure` or `unzip`. */
export async function bytesOf(download: import('@playwright/test').Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

/** Drag across an element, in fractions of its own box. */
export async function dragAcross(
  page: Page,
  target: import('@playwright/test').Locator,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const at = (fx: number, fy: number) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });
  const a = at(...from);
  const b = at(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/**
 * The text a PDF reader can pull out of a PDF, in node.
 *
 * Searching the raw bytes for a string does NOT work and is the trap this
 * exists to avoid: PDF content streams are Flate-compressed, so a plain byte
 * search fails to find text that is perfectly selectable when the file is
 * opened. A redaction spec built on a byte search passes whether or not the
 * tool does anything at all.
 */
export async function pdfText(bytes: Buffer | Uint8Array, password?: string): Promise<string[]> {
  const require = createRequire(import.meta.url);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: dirname(require.resolve('pdfjs-dist/package.json')) + '/standard_fonts/',
    password,
  }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) out.push(item.str);
    }
  }
  return out;
}

/**
 * Does a reader demand a password for this PDF?
 *
 * The companion to `pdfText`, and it exists for the same reason: the only proof
 * that a file is encrypted is that a reader refuses to open it. A byte search
 * for `/Encrypt` would pass on a file that merely says it is protected, and the
 * whole point of the tool is that the contents are actually unreadable.
 *
 * Returns pdf.js's own reason, so a wrong password and a corrupt file are
 * distinguishable rather than both being "it did not open".
 */
export async function pdfNeedsPassword(
  bytes: Buffer | Uint8Array,
  password?: string,
): Promise<{ opened: boolean; reason?: string }> {
  try {
    await pdfText(bytes, password);
    return { opened: true };
  } catch (e) {
    return { opened: false, reason: (e as Error).name };
  }
}

/**
 * What a file actually is, from its first bytes.
 *
 * Needed because `canvas.toBlob` answers a request for a format it cannot write
 * by quietly returning a PNG, so a converted file's name is not evidence of its
 * contents. Only the magic bytes settle it.
 */
export function sniff(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return 'unknown';
}

/** A tiny valid JPEG, 8x8 and flat red. Base64 so the spec needs no fixture file. */
const BARE_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooorlPeP/9k=';

/**
 * That JPEG with an EXIF DateTimeOriginal spliced into it.
 *
 * Written by hand because the point is to test that the app reads a real EXIF
 * block, and a fixture built by the same library that reads it would prove
 * nothing. The layout is a little-endian TIFF: header, IFD0 holding only the
 * pointer to the Exif sub-IFD, that sub-IFD holding only DateTimeOriginal, and
 * the twenty ASCII bytes it points at.
 *
 * EXIF timestamps carry no timezone, so a reader interprets them as local time.
 * Specs that assert on the resulting name must pin the browser's timezone.
 */
export function jpegTakenAt(stamp: string): Buffer {
  const ascii = Buffer.from(`${stamp}\0`, 'ascii');
  if (ascii.length !== 20) throw new Error('stamp must be YYYY:MM:DD HH:MM:SS');

  const IFD0_AT = 8;
  const IFD0_LEN = 2 + 12 + 4;
  const EXIF_AT = IFD0_AT + IFD0_LEN;
  const EXIF_LEN = 2 + 12 + 4;
  const DATA_AT = EXIF_AT + EXIF_LEN;

  const tiff = Buffer.alloc(DATA_AT + ascii.length);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(IFD0_AT, 4);

  tiff.writeUInt16LE(1, IFD0_AT); // one entry
  tiff.writeUInt16LE(0x8769, IFD0_AT + 2); // ExifIFDPointer
  tiff.writeUInt16LE(4, IFD0_AT + 4); // LONG
  tiff.writeUInt32LE(1, IFD0_AT + 6);
  tiff.writeUInt32LE(EXIF_AT, IFD0_AT + 10);
  tiff.writeUInt32LE(0, IFD0_AT + 14); // no next IFD

  tiff.writeUInt16LE(1, EXIF_AT);
  tiff.writeUInt16LE(0x9003, EXIF_AT + 2); // DateTimeOriginal
  tiff.writeUInt16LE(2, EXIF_AT + 4); // ASCII
  tiff.writeUInt32LE(20, EXIF_AT + 6);
  tiff.writeUInt32LE(DATA_AT, EXIF_AT + 10);
  tiff.writeUInt32LE(0, EXIF_AT + 14);
  ascii.copy(tiff, DATA_AT);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0);
  marker.writeUInt16BE(payload.length + 2, 2);

  const jpeg = Buffer.from(BARE_JPEG, 'base64');
  // Straight after SOI, before everything else.
  return Buffer.concat([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)]);
}

/** The same JPEG with no EXIF at all, for the no-date path. */
export function jpegWithoutExif(): Buffer {
  return Buffer.from(BARE_JPEG, 'base64');
}
