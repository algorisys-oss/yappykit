/**
 * Turning PDF pages into images.
 *
 * Deliberately not built on core/pdf/compress's `loadPdf`. That caches every
 * page at one fixed resolution because the size search re-encodes the same
 * bitmaps repeatedly, which is exactly wrong here: this needs a REAL render at
 * the resolution the user asked for (upscaling a 200 DPI page and calling it 300
 * would be a lie), and it never needs a second look at a page, so it encodes and
 * releases one at a time rather than holding a hundred canvases in memory.
 *
 * The choice offered is the job, not the number. "For printing" and "For screen
 * or email" are things a person knows about their own situation; 300 and 150 DPI
 * are not.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  dpiToScale,
  renderSize,
  dpiFor,
  imageName,
  type ImageType,
  type OutputKind,
} from './plan';

export { dpiFor, imageName, extensionFor, OUTPUT_KINDS } from './plan';
export type { ImageType, OutputKind } from './plan';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageImage {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface RenderOptions {
  kind: OutputKind;
  type: ImageType;
  /** JPEG only; PNG ignores it and is lossless. */
  quality?: number;
}

/**
 * Render every page and hand back one encoded image each.
 *
 * `onProgress` fires per page because rasterising a long scan takes long enough
 * that a silent UI reads as a hang.
 */
export async function pdfToImages(
  file: File,
  options: RenderOptions,
  onProgress?: (fraction: number) => void,
): Promise<PageImage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const scale = dpiToScale(dpiFor(options.kind));
  const out: PageImage[] = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const size = renderSize(base.width, base.height, scale);

      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');

      // JPEG has no alpha, and an unpainted canvas is transparent black, so a
      // page with no background of its own would come out black rather than
      // white. PNG keeps the white too, which is what a page looks like.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport: page.getViewport({ scale: size.scale }),
      } as Parameters<typeof page.render>[0]).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, options.type, options.quality),
      );
      if (!blob) throw new Error('This browser could not encode the page.');

      out.push({
        name: imageName(file.name, i, options.type),
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
      });

      // Release the page and the canvas before the next one, so a long document
      // costs one page of memory rather than all of them.
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      onProgress?.(i / doc.numPages);
    }
  } finally {
    void task.destroy();
  }
  return out;
}
