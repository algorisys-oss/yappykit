import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { BASE_DPI, dpiToScale, renderSize, hasMeaningfulText } from './plan';

/**
 * PDF compression to an exact byte target.
 *
 * Each page is rendered once at BASE_DPI and cached, then the target-size engine
 * re-encodes those cached bitmaps at varying JPEG quality and scale until the
 * document fits the budget. Rendering once and re-encoding many times is what
 * makes the search affordable: a binary search over a dozen iterations would
 * otherwise re-rasterise the whole document a dozen times.
 *
 * The output is a fresh document built from those images, so it carries none of
 * the original's metadata — a small privacy gain, and the same one the image
 * compressor gets from re-encoding.
 *
 * Everything happens in this tab. pdf.js parses in its own worker; nothing is
 * uploaded.
 */

// pdf.js needs its worker as a separate module; Vite resolves and fingerprints
// this URL at build time so it is cached like any other asset.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Above this, caching a full-resolution bitmap per page starts to threaten the
 * tab's memory on modest hardware. The tool still runs — it just says so.
 */
export const HEAVY_PAGE_COUNT = 30;

export interface PageInfo {
  widthPt: number;
  heightPt: number;
}

export interface PdfAnalysis {
  pageCount: number;
  pages: PageInfo[];
  totalChars: number;
  /** True when rasterising would cost the reader selectable text. */
  hasText: boolean;
  /** True when the document is large enough to be slow to process. */
  heavy: boolean;
}

export interface LoadedPdf {
  analysis: PdfAnalysis;
  /** One cached full-resolution render per page, in page order. */
  bitmaps: HTMLCanvasElement[];
  close(): void;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Parse a PDF, measure it, and cache a full-resolution render of every page.
 *
 * `onProgress` fires per page (0..1) because rasterising a multi-page scan takes
 * long enough that a silent UI reads as a hang.
 */
export async function loadPdf(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<LoadedPdf> {
  const data = new Uint8Array(await file.arrayBuffer());
  // Keep the loading task: destroy() lives on it, not on the document proxy,
  // and it is what tears down pdf.js's worker.
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  const pages: PageInfo[] = [];
  const bitmaps: HTMLCanvasElement[] = [];
  let totalChars = 0;

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);

      // getViewport at scale 1 reports the page box in points.
      const base = page.getViewport({ scale: 1 });
      pages.push({ widthPt: base.width, heightPt: base.height });

      const text = await page.getTextContent();
      for (const item of text.items) {
        if ('str' in item) totalChars += item.str.length;
      }

      const size = renderSize(base.width, base.height, dpiToScale(BASE_DPI));
      const canvas = makeCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');

      // A JPEG has no alpha channel; without an explicit white ground a
      // transparent PDF page would encode as black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport: page.getViewport({ scale: size.scale }),
      } as Parameters<typeof page.render>[0]).promise;

      bitmaps.push(canvas);
      page.cleanup();
      onProgress?.(i / doc.numPages);
    }
  } finally {
    void task.destroy();
  }

  return {
    analysis: {
      pageCount: pages.length,
      pages,
      totalChars,
      hasText: hasMeaningfulText(totalChars, pages.length),
      heavy: pages.length > HEAVY_PAGE_COUNT,
    },
    bitmaps,
    close() {
      // Releasing the backing store: some engines hold on to a canvas until its
      // dimensions are zeroed.
      for (const c of bitmaps) {
        c.width = 0;
        c.height = 0;
      }
      bitmaps.length = 0;
    },
  };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('This browser could not encode the page as a JPEG.'));
          return;
        }
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Build the `encode(params)` bridge the target-size engine searches over.
 *
 * `scale` shrinks the rendered bitmap (fewer pixels), `quality` sets the JPEG
 * quality. The PAGE is always written at its original size in points, so the
 * output prints at the correct physical dimensions no matter how far the raster
 * resolution was reduced.
 */
export function makePdfEncoder(loaded: LoadedPdf) {
  return async (
    params: { quality: number; scale: number },
    signal: AbortSignal,
  ): Promise<Uint8Array> => {
    const out = await PDFDocument.create();

    for (let i = 0; i < loaded.bitmaps.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const src = loaded.bitmaps[i]!;
      const info = loaded.analysis.pages[i]!;

      const w = Math.max(1, Math.round(src.width * params.scale));
      const h = Math.max(1, Math.round(src.height * params.scale));

      let encoded: Uint8Array;
      if (w === src.width && h === src.height) {
        encoded = await toJpeg(src, params.quality);
      } else {
        const scaled = makeCanvas(w, h);
        const ctx = scaled.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(src, 0, 0, w, h);
        encoded = await toJpeg(scaled, params.quality);
        scaled.width = 0;
        scaled.height = 0;
      }

      const img = await out.embedJpg(encoded);
      const page = out.addPage([info.widthPt, info.heightPt]);
      page.drawImage(img, { x: 0, y: 0, width: info.widthPt, height: info.heightPt });
    }

    return out.save();
  };
}
