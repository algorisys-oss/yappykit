import { PDFDocument } from 'pdf-lib';

/**
 * Pictures into a PDF, one page each.
 *
 * The job is almost always the same: a form wants a PDF and what you have is
 * photographs. Two sides of an ID card, a receipt on a table, four pages of a
 * contract shot with a phone. So the tool asks the one question that decides
 * what comes out — what the page should be — and works everything else out.
 *
 * Orientation is not a control. A landscape photograph gets a landscape sheet
 * and a portrait one gets a portrait sheet, because the alternative is a
 * picture printed small and sideways in the middle of the page, which nobody
 * has ever wanted. Pages within one document may therefore differ, which is
 * legal and normal: every PDF page carries its own MediaBox.
 *
 * JPEG and PNG are embedded byte for byte. pdf-lib writes the compressed data
 * straight into the file, so a photograph in a PDF made here is the same
 * photograph, at the same resolution, not a re-encoded copy of it. Anything
 * else (HEIC, WebP, AVIF) has to be converted first, which is the caller's job
 * because it needs a canvas; `imageKind` is what tells it which files those are.
 *
 * pdf-lib runs in this tab. Nothing is uploaded.
 */

/** Paper, in PostScript points (1/72 inch), narrow side first. */
export const A4 = { short: 595.28, long: 841.89 } as const;
export const LETTER = { short: 612, long: 792 } as const;

/** Half an inch: enough to clear what a home printer refuses to print on. */
export const MARGIN_PT = 36;

export type Paper = 'a4' | 'letter' | 'image';

export type ImageKind = 'jpeg' | 'png';

export interface PdfImage {
  bytes: Uint8Array;
  kind: ImageKind;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  width: number;
  height: number;
  /** Where the picture sits on the page, measured from the bottom-left. */
  draw: Rect;
}

const SIGNATURES: { kind: ImageKind; magic: number[] }[] = [
  { kind: 'jpeg', magic: [0xff, 0xd8, 0xff] },
  { kind: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/**
 * What a file really is, by its first bytes.
 *
 * Sniffed rather than taken from the extension or the browser's MIME guess,
 * both of which are routinely wrong: phones hand over HEIC files named .jpg,
 * and a mislabelled file embedded as a JPEG produces a PDF that opens to a
 * blank page instead of an error.
 */
export function imageKind(bytes: Uint8Array): ImageKind | null {
  for (const { kind, magic } of SIGNATURES) {
    if (magic.every((byte, i) => bytes[i] === byte)) return kind;
  }
  return null;
}

/** The sheet for a picture: the chosen paper, turned to match the picture. */
function sheetFor(imageWidth: number, imageHeight: number, paper: Paper): [number, number] {
  if (paper === 'image') {
    // Borderless: the page IS the picture. Cut to the picture's shape and sized
    // so its longest side is a sheet of paper, which keeps it printable on one
    // page instead of producing the 40-inch page that the pixel count would
    // imply at any honest DPI.
    const ratio = imageWidth / imageHeight;
    return ratio >= 1 ? [A4.long, A4.long / ratio] : [A4.long * ratio, A4.long];
  }
  const size = paper === 'letter' ? LETTER : A4;
  return imageWidth > imageHeight ? [size.long, size.short] : [size.short, size.long];
}

/** The page a picture gets, and where on it the picture is drawn. */
export function layoutPage(
  imageWidth: number,
  imageHeight: number,
  paper: Paper,
  margin: number,
): PageLayout {
  const [width, height] = sheetFor(imageWidth, imageHeight, paper);

  if (paper === 'image') {
    // A margin would reintroduce the border this mode exists to remove.
    return { width, height, draw: { x: 0, y: 0, width, height } };
  }

  const usableWidth = Math.max(1, width - 2 * margin);
  const usableHeight = Math.max(1, height - 2 * margin);
  const scale = Math.min(usableWidth / imageWidth, usableHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  return {
    width,
    height,
    draw: {
      x: (width - drawWidth) / 2,
      y: (height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    },
  };
}

/** Assemble the document, one page per picture, in the order given. */
export async function buildImagePdf(
  images: readonly PdfImage[],
  paper: Paper,
  margin: number,
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('There are no pictures to put in a PDF.');

  const doc = await PDFDocument.create();
  for (const image of images) {
    const embedded =
      image.kind === 'jpeg' ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes);
    const layout = layoutPage(embedded.width, embedded.height, paper, margin);
    doc.addPage([layout.width, layout.height]).drawImage(embedded, layout.draw);
  }
  return doc.save();
}

/** What to call the download: recognisably derived from the first picture. */
export function pdfName(names: readonly string[]): string {
  const base = (names[0] ?? '').replace(/\.[^./\\]+$/, '').trim();
  return base ? `${base}.pdf` : 'images.pdf';
}
