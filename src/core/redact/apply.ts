/**
 * Applying redactions, so that what was covered is actually gone.
 *
 * The failure this tool exists to avoid is the black rectangle that is only a
 * drawing: a shape laid over a PDF hides the text on screen while the text
 * object sits underneath it, recoverable by anyone who selects the page or runs
 * a text extractor. Newspapers and law firms have published documents that way.
 *
 * So nothing here draws over the original. The page is RASTERISED first, which
 * discards every text and vector object it ever had, the boxes are painted onto
 * those pixels, and a new document is built from the result. What comes back
 * has no text layer at all, which is the point: there is nothing left to
 * recover, and the tool says plainly that this is the trade.
 *
 * The same applies to an image: the pixels under the box are overwritten and
 * the file is re-encoded, so the original values are not merely hidden.
 */
import { PDFDocument } from 'pdf-lib';
import { toPixels, type Rect } from './regions';

/** Paint the regions onto a canvas, in place, destroying what is under them. */
export function paintRedactions(canvas: HTMLCanvasElement, regions: readonly Rect[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.save();
  // Opaque black, and no compositing tricks: the pixels underneath are replaced,
  // not blended with, so nothing about them survives in the output.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000000';
  for (const region of regions) {
    const px = toPixels(region, canvas.width, canvas.height);
    ctx.fillRect(px.x, px.y, px.w, px.h);
  }
  ctx.restore();
}

/**
 * Build a PDF out of already-painted page canvases.
 *
 * Every page becomes a JPEG at its original point size, so the document keeps
 * its page geometry while losing everything that was ever selectable on it. The
 * output is a new document and inherits none of the original's metadata, which
 * is the other half of redacting: an author name in the info dictionary is not
 * covered by any box.
 */
export async function pdfFromPages(
  pages: readonly { canvas: HTMLCanvasElement; widthPt: number; heightPt: number }[],
  quality = 0.92,
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('There are no pages to write.');
  const out = await PDFDocument.create();
  for (const page of pages) {
    const blob = await new Promise<Blob | null>((resolve) =>
      page.canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new Error('This browser could not encode a page.');
    const embedded = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const added = out.addPage([page.widthPt, page.heightPt]);
    added.drawImage(embedded, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  }
  return out.save();
}

/** What to call the result, so a redacted copy is never mistaken for the original. */
export function redactedName(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return `${stem}-redacted${ext}`;
}
