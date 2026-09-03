import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import {
  layoutPage,
  imageKind,
  buildImagePdf,
  pdfName,
  A4,
  LETTER,
  MARGIN_PT,
  type PdfImage,
} from './from-images';

/** A real PNG of the given size, so pdf-lib parses genuine dimensions. */
function png(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length);
    body.set([...type].map((ch) => ch.charCodeAt(0)), 0);
    body.set(data, 4);
    const out = new Uint8Array(8 + data.length + 4);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(body, 4);
    new DataView(out.buffer).setUint32(out.length - 4, crc(body));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  // Each row is a filter byte followed by w RGB triples.
  const raw = new Uint8Array(h * (1 + w * 3));
  const idat = new Uint8Array(deflateSync(raw));

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const aspect = (w: number, h: number) => w / h;

describe('imageKind', () => {
  it('recognises a JPEG by its magic bytes', () => {
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
  });

  it('recognises a PNG by its signature', () => {
    expect(imageKind(png(2, 2))).toBe('png');
  });

  it('returns null for anything else, so the caller re-encodes rather than guessing', () => {
    expect(imageKind(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull(); // WebP/RIFF
    expect(imageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(imageKind(new Uint8Array([]))).toBeNull();
  });
});

describe('layoutPage', () => {
  it('puts a portrait image on a portrait sheet', () => {
    const page = layoutPage(1200, 1600, 'a4', 0);
    expect([page.width, page.height]).toEqual([A4.short, A4.long]);
  });

  it('turns the sheet sideways for a landscape image, rather than shrinking it', () => {
    const page = layoutPage(1600, 1200, 'a4', 0);
    expect([page.width, page.height]).toEqual([A4.long, A4.short]);
  });

  it('never stretches the picture', () => {
    for (const [w, h] of [[1200, 1600], [1600, 1200], [1000, 1000], [400, 3000]] as const) {
      const { draw } = layoutPage(w, h, 'a4', MARGIN_PT);
      expect(aspect(draw.width, draw.height)).toBeCloseTo(aspect(w, h), 4);
    }
  });

  it('centres the picture on the sheet', () => {
    const page = layoutPage(1000, 1000, 'a4', 0);
    expect(page.width - (page.draw.x + page.draw.width)).toBeCloseTo(page.draw.x, 4);
    expect(page.height - (page.draw.y + page.draw.height)).toBeCloseTo(page.draw.y, 4);
  });

  it('keeps the picture inside the margin on every side', () => {
    const page = layoutPage(1600, 1200, 'a4', MARGIN_PT);
    expect(page.draw.x).toBeGreaterThanOrEqual(MARGIN_PT - 0.01);
    expect(page.draw.y).toBeGreaterThanOrEqual(MARGIN_PT - 0.01);
    expect(page.draw.x + page.draw.width).toBeLessThanOrEqual(page.width - MARGIN_PT + 0.01);
    expect(page.draw.y + page.draw.height).toBeLessThanOrEqual(page.height - MARGIN_PT + 0.01);
  });

  it('fills the usable width when the picture is wider than the sheet', () => {
    const page = layoutPage(3000, 1000, 'a4', MARGIN_PT);
    expect(page.draw.width).toBeCloseTo(page.width - 2 * MARGIN_PT, 4);
  });

  it('fills the usable height when the picture is taller than the sheet', () => {
    const page = layoutPage(1000, 3000, 'a4', MARGIN_PT);
    expect(page.draw.height).toBeCloseTo(page.height - 2 * MARGIN_PT, 4);
  });

  it('scales a small picture up to fill the sheet, rather than stamping it in a corner', () => {
    const page = layoutPage(100, 100, 'a4', 0);
    expect(page.draw.width).toBeCloseTo(A4.short, 4);
  });

  it('uses US Letter when asked for it', () => {
    const page = layoutPage(1200, 1600, 'letter', 0);
    expect([page.width, page.height]).toEqual([LETTER.short, LETTER.long]);
  });

  it('cuts the page to the picture in borderless mode, at sheet size', () => {
    const page = layoutPage(1600, 1200, 'image', MARGIN_PT);
    expect(aspect(page.width, page.height)).toBeCloseTo(aspect(1600, 1200), 4);
    expect(Math.max(page.width, page.height)).toBeCloseTo(A4.long, 4);
  });

  it('leaves no border at all in borderless mode, margin or not', () => {
    const page = layoutPage(1600, 1200, 'image', MARGIN_PT);
    expect(page.draw).toEqual({ x: 0, y: 0, width: page.width, height: page.height });
  });
});

describe('buildImagePdf', () => {
  const pngImage = (w: number, h: number): PdfImage => ({ bytes: png(w, h), kind: 'png' });

  it('makes one page per picture, in the order given', async () => {
    const bytes = await buildImagePdf(
      [pngImage(1000, 2000), pngImage(2000, 1000), pngImage(1000, 1000)],
      'a4',
      0,
    );
    const pages = (await PDFDocument.load(bytes)).getPages();
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.getWidth() > p.getHeight())).toEqual([false, true, false]);
  });

  it('gives every page the paper size in borderless mode too', async () => {
    const bytes = await buildImagePdf([pngImage(2000, 1000)], 'image', 0);
    const [page] = (await PDFDocument.load(bytes)).getPages();
    expect(page!.getWidth() / page!.getHeight()).toBeCloseTo(2, 3);
  });

  it('refuses an empty list rather than writing a PDF with no pages', async () => {
    await expect(buildImagePdf([], 'a4', 0)).rejects.toThrow();
  });

  it('carries no metadata from the machine that made it', async () => {
    const doc = await PDFDocument.load(await buildImagePdf([pngImage(100, 100)], 'a4', 0));
    expect(doc.getAuthor()).toBeUndefined();
    expect(doc.getTitle()).toBeUndefined();
  });
});

describe('pdfName', () => {
  it('names the file after the first picture', () => {
    expect(pdfName(['holiday.jpg'])).toBe('holiday.pdf');
    expect(pdfName(['scan-1.HEIC', 'scan-2.HEIC'])).toBe('scan-1.pdf');
  });

  it('keeps dots inside the name', () => {
    expect(pdfName(['invoice.2024.final.png'])).toBe('invoice.2024.final.pdf');
  });

  it('falls back when there is nothing to name it after', () => {
    expect(pdfName([])).toBe('images.pdf');
    expect(pdfName(['.jpg'])).toBe('images.pdf');
  });
});
