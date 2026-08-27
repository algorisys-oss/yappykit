/**
 * A stitched capture as a PDF.
 *
 * PDF is here because a long screenshot is often evidence — a chat thread, an
 * order history, a bank statement — and the thing people do with evidence is
 * attach it to a form or print it. A 20,000 pixel tall PNG does neither.
 *
 * Pages are cut at the paper's own aspect ratio and drawn at full width, so a
 * page of the capture is a page of the document with nothing stretched and no
 * margin invented. A single very long page is not offered because PDF cannot
 * express one: the format caps a page at 14,400 points, which is 200 inches,
 * and an ordinary phone capture passes that within a dozen screenshots.
 *
 * The renderer is a callback rather than a finished image on purpose. It lets
 * the caller paint one page-sized slice at a time, which is what allows a
 * capture too tall for this device's canvas to become a PDF anyway.
 */
import { PDFDocument } from 'pdf-lib';

/** A4 portrait, in PostScript points (1/72 inch). */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export interface PageSlice {
  y: number;
  h: number;
}

/** The slice height, in image pixels, that fills one page at full width. */
export function sliceHeightFor(widthPx: number): number {
  return Math.round((widthPx * A4_HEIGHT_PT) / A4_WIDTH_PT);
}

/** Consecutive page-sized slices covering `totalHeight`, the last one short. */
export function slicePages(totalHeight: number, sliceHeight: number): PageSlice[] {
  const out: PageSlice[] = [];
  for (let y = 0; y < totalHeight; y += sliceHeight) {
    out.push({ y, h: Math.min(sliceHeight, totalHeight - y) });
  }
  return out;
}

/**
 * Assemble the pages.
 *
 * `renderSlice` returns the JPEG bytes for one slice, at `widthPx` wide. A
 * short final slice keeps its proportions and sits at the top of a full-height
 * page rather than being stretched down it.
 */
export async function buildPdf(
  slices: readonly PageSlice[],
  widthPx: number,
  renderSlice: (slice: PageSlice, index: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ptPerPx = A4_WIDTH_PT / widthPx;
  for (const [i, slice] of slices.entries()) {
    const image = await doc.embedJpg(await renderSlice(slice, i));
    const page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const drawH = slice.h * ptPerPx;
    page.drawImage(image, {
      x: 0,
      y: A4_HEIGHT_PT - drawH,
      width: A4_WIDTH_PT,
      height: drawH,
    });
  }
  return doc.save();
}
