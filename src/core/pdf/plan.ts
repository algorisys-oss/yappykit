/**
 * PDF compression planning — the arithmetic, kept away from the browser APIs.
 *
 * The compressor works by re-rendering each page as a JPEG and rebuilding the
 * document around those images. That is the only approach that can reliably hit
 * an arbitrary byte target (the audience is people facing a hard "under 200 KB"
 * upload limit), and it is the right approach for the common case, where the
 * PDF is already a scan.
 *
 * It has a real cost: a page that contained selectable text becomes a picture of
 * that text. The functions here decide when that cost applies so the UI can warn
 * before doing it, rather than after.
 */

/** A PDF point is 1/72 inch, by definition. */
export const POINTS_PER_INCH = 72;

/**
 * Render resolution used for the cached full-size pass. 200 DPI is comfortably
 * above what any form portal needs and leaves headroom for the search to scale
 * down; going higher mostly costs memory on large documents.
 */
export const BASE_DPI = 200;

/**
 * Ceiling on either dimension of a rendered page bitmap. A 200 DPI render of an
 * A0 poster is ~9500 px on the long edge, and browsers start failing canvas
 * allocations well before that — silently producing a blank page rather than
 * throwing. Clamp instead.
 */
export const MAX_RENDER_PX = 4000;

export function dpiToScale(dpi: number): number {
  return dpi / POINTS_PER_INCH;
}

export function scaleToDpi(scale: number): number {
  return scale * POINTS_PER_INCH;
}

export interface RenderSize {
  width: number;
  height: number;
  /** The scale actually used, after clamping. */
  scale: number;
  /** True when MAX_RENDER_PX forced a smaller render than requested. */
  clamped: boolean;
}

/**
 * Pixel dimensions for rendering a page, given its size in PDF points.
 *
 * Dimensions are rounded to whole pixels and never below 1: a zero-width canvas
 * throws in every browser, and a page can legitimately be a sliver.
 */
export function renderSize(widthPt: number, heightPt: number, scale: number): RenderSize {
  const longest = Math.max(widthPt, heightPt) * scale;
  const clamped = longest > MAX_RENDER_PX;
  const effective = clamped ? (MAX_RENDER_PX / Math.max(widthPt, heightPt)) : scale;
  return {
    width: Math.max(1, Math.round(widthPt * effective)),
    height: Math.max(1, Math.round(heightPt * effective)),
    scale: effective,
    clamped,
  };
}

/**
 * Whether a document carries enough text to be worth warning about.
 *
 * Scanned PDFs are not always textless: a scanner may embed a stray character,
 * and some carry an invisible OCR layer. A per-page average is used rather than
 * a total so that one text-heavy cover page on a 50-page scan does not trigger
 * the warning, and a genuine 1-page text document still does.
 */
export const TEXT_CHARS_PER_PAGE = 100;

export function hasMeaningfulText(totalChars: number, pageCount: number): boolean {
  if (pageCount <= 0) return false;
  return totalChars / pageCount >= TEXT_CHARS_PER_PAGE;
}

export type Outcome = 'fit' | 'floor';

export interface CompressionSummary {
  outcome: Outcome;
  /** Effective render resolution of the output, for an honest quality claim. */
  dpi: number;
  percentSmaller: number | null;
}

/**
 * Describe what the search achieved, in terms a reader can check.
 *
 * `percentSmaller` is null rather than negative when the output grew: rebuilding
 * a small vector PDF as images can legitimately make it bigger, and reporting
 * "-40% smaller" would be nonsense.
 */
export function summarise(
  originalBytes: number,
  outputBytes: number,
  withinBudget: boolean,
  scale: number,
): CompressionSummary {
  const grew = outputBytes >= originalBytes;
  return {
    outcome: withinBudget ? 'fit' : 'floor',
    dpi: Math.round(scaleToDpi(dpiToScale(BASE_DPI) * scale)),
    percentSmaller: grew ? null : Math.round((1 - outputBytes / originalBytes) * 100),
  };
}
