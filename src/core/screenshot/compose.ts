/**
 * The canvas half of the stitcher: pixels in, pixels out.
 *
 * ./stitch decides where every row of the output comes from without ever
 * touching an image. This module is what feeds it (turning decoded screenshots
 * into row signatures) and what acts on its answer (painting the plan). Keeping
 * the two apart is what lets the seam-finding be tested exhaustively without a
 * browser, and it is why this file has no decisions of its own.
 */
import { decodeImage } from '@core/image/canvas-codec';
import { SIG_SAMPLES, type Signature, type StitchPlan } from './stitch';

export interface Shot {
  name: string;
  /** Pixel size of the file itself. */
  naturalWidth: number;
  naturalHeight: number;
  /** Size in the capture's shared coordinate space — see `commonWidth`. */
  width: number;
  height: number;
  /** True when this screenshot had to be resized to match the others. */
  scaled: boolean;
  signature: Signature;
  bitmap: ImageBitmap;
  close(): void;
}

export interface LoadResult {
  shots: Shot[];
  /** Files that could not be decoded as images, in the order they were added. */
  rejected: string[];
}

/**
 * The width every screenshot is measured in.
 *
 * A capture is normally all one device, so this is simply that width. When it
 * is not — a screenshot cropped, or one taken on a different phone — the odd
 * one out is scaled to the majority rather than rejected, because a mismatched
 * width is usually a detail of how the files were saved and not a sign that the
 * user meant something else. Ties go to the widest, which resamples the fewest
 * pixels of the most files.
 */
export function commonWidth(widths: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = widths[0] ?? 0;
  let bestCount = 0;
  for (const [w, n] of counts) {
    if (n > bestCount || (n === bestCount && w > best)) {
      best = w;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Reduce an image to `SIG_SAMPLES` luma values per row.
 *
 * The horizontal averaging is done here rather than by asking the canvas to
 * draw the image 32 pixels wide, and that is not fussiness. A canvas resample
 * is a single separable filter over both axes, and its vertical kernel is not
 * an identity even when the vertical scale is exactly 1: it blends each row
 * slightly with its neighbours. One blended row at the boundary between a
 * status bar and the content below is enough to make that row differ between
 * two screenshots, which costs a row of fixed interface at every seam. Measured
 * on the fixtures: a 20 row bar was detected as 19, a 12 row bar as 11.
 *
 * So the image is drawn at its own size, which is a straight copy when nothing
 * needs rescaling, and the columns are averaged in this loop. Averaging rather
 * than sampling every (width/32)th column matters too: sampling would step over
 * a one pixel line of text entirely and make two different rows look identical.
 *
 * The luma weights match the ones in core/document/enhance, so "how bright is
 * this row" means the same thing everywhere in this codebase.
 */
function signatureOf(bitmap: ImageBitmap, width: number, height: number): Signature {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const rows = new Uint8Array(SIG_SAMPLES * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let s = 0; s < SIG_SAMPLES; s++) {
      const from = Math.floor((s * width) / SIG_SAMPLES);
      const to = Math.max(from + 1, Math.floor(((s + 1) * width) / SIG_SAMPLES));
      let sum = 0;
      for (let x = from; x < to; x++) {
        const p = (rowStart + x) * 4;
        sum += 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
      }
      rows[y * SIG_SAMPLES + s] = (sum / (to - from)) | 0;
    }
  }
  canvas.width = 0;
  canvas.height = 0;
  return { width, height, samples: SIG_SAMPLES, rows };
}

/** Decode every file, agree on a width, and measure each one. */
export async function loadShots(files: readonly File[]): Promise<LoadResult> {
  const decoded: { name: string; bitmap: ImageBitmap; close(): void }[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      const image = await decodeImage(file);
      decoded.push({ name: file.name, bitmap: image.bitmap, close: image.close });
    } catch {
      rejected.push(file.name);
    }
  }

  const width = commonWidth(decoded.map((d) => d.bitmap.width));
  const shots = decoded.map((d) => {
    const scale = width / d.bitmap.width;
    const height = Math.round(d.bitmap.height * scale);
    return {
      name: d.name,
      naturalWidth: d.bitmap.width,
      naturalHeight: d.bitmap.height,
      width,
      height,
      scaled: scale !== 1,
      signature: signatureOf(d.bitmap, width, height),
      bitmap: d.bitmap,
      close: d.close,
    };
  });
  return { shots, rejected };
}

/**
 * A canvas of this size that this device will actually draw into, or null.
 *
 * Browsers cap canvas dimensions and total area, and the cap is not something
 * they will tell you: Safari in particular returns a canvas of the size you
 * asked for and then quietly draws nothing into it past its limit. So the limit
 * is measured rather than looked up. Write a pixel in the far corner, read it
 * back, and believe the answer. A twelve-screenshot phone capture lands around
 * 17 megapixels, which is exactly where the mobile limits sit.
 *
 * The tested canvas is HANDED BACK rather than thrown away, because on the
 * captures where this matters the canvas is tens of megabytes and allocating a
 * second one just like it is how a probe turns into the failure it was checking
 * for. The sentinel pixel is cleared before it is returned.
 */
function usableCanvas(width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const release = () => {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  };
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return release();
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(width - 1, height - 1, 1, 1);
    const pixel = ctx.getImageData(width - 1, height - 1, 1, 1).data;
    if (pixel[0] !== 255 || pixel[3] !== 255) return release();
    ctx.clearRect(0, 0, width, height);
    return canvas;
  } catch {
    return release();
  }
}

/** The tallest canvas of this width the device will draw, at most `desired`. */
export function maxCanvasHeight(width: number, desired: number): number {
  const canDraw = (height: number) => {
    const canvas = usableCanvas(width, height);
    if (!canvas) return false;
    canvas.width = 0;
    canvas.height = 0;
    return true;
  };
  if (desired < 1) return 1;
  if (canDraw(desired)) return desired;
  let good = 1;
  let bad = desired;
  while (bad - good > 64) {
    const mid = Math.floor((good + bad) / 2);
    if (canDraw(mid)) good = mid;
    else bad = mid;
  }
  return good;
}

/** Paint the part of the plan between two output rows onto `ctx`. */
function drawRange(
  ctx: CanvasRenderingContext2D,
  plan: StitchPlan,
  shots: readonly Shot[],
  fromY: number,
  toY: number,
  scale: number,
): void {
  for (const piece of plan.pieces) {
    const top = Math.max(piece.dstY, fromY);
    const bottom = Math.min(piece.dstY + piece.srcH, toY);
    if (bottom <= top) continue;
    const shot = shots[piece.index]!;
    const perRow = shot.naturalHeight / shot.height;
    // Destination edges are rounded rather than scaled independently, so
    // consecutive pieces share an edge exactly and no seam shows a hairline.
    const dy = Math.round((top - fromY) * scale);
    const dh = Math.round((bottom - fromY) * scale) - dy;
    ctx.drawImage(
      shot.bitmap,
      0,
      (piece.srcY + (top - piece.dstY)) * perRow,
      shot.naturalWidth,
      (bottom - top) * perRow,
      0,
      dy,
      ctx.canvas.width,
      dh,
    );
  }
}

export interface Composed {
  canvas: HTMLCanvasElement;
  /** 1 unless the capture had to be shrunk to fit this device's canvas limit. */
  scale: number;
}

/** The whole capture on one canvas, shrunk only if this device demands it. */
export function composePlan(plan: StitchPlan, shots: readonly Shot[]): Composed {
  let scale = 1;
  let canvas = usableCanvas(plan.width, plan.height);
  if (!canvas) {
    scale = Math.min(1, maxCanvasHeight(plan.width, plan.height) / plan.height);
    canvas = usableCanvas(
      Math.max(1, Math.round(plan.width * scale)),
      Math.max(1, Math.round(plan.height * scale)),
    );
  }
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) throw new Error('This capture is too large for this device to draw.');
  drawRange(ctx, plan, shots, 0, plan.height, scale);
  return { canvas, scale };
}

/**
 * One page-sized slice, painted on its own.
 *
 * The PDF path never allocates the full-height canvas, so it works on captures
 * this device could not hold as a single image.
 */
export function composeSlice(
  plan: StitchPlan,
  shots: readonly Shot[],
  fromY: number,
  height: number,
  canvas: HTMLCanvasElement,
): void {
  canvas.width = plan.width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRange(ctx, plan, shots, fromY, fromY + height, 1);
}

export type ImageType = 'image/png' | 'image/jpeg';

/**
 * JPEG quality for the shipped file.
 *
 * Fixed rather than offered as a slider. The choice a person actually has here
 * is between an exact image, a small one and a document, which is what the
 * three output options are; a quality number is a setting they would have to
 * guess at to reach one of those.
 */
const JPEG_QUALITY = 0.85;

export async function encodeCanvas(canvas: HTMLCanvasElement, type: ImageType): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new Error('Canvas encode failed');
  return blob;
}

/** What to call the download: recognisably derived from the first screenshot. */
export function stitchedName(names: readonly string[], extension: string): string {
  const first = names[0];
  if (!first) return `stitched.${extension}`;
  return `${first.replace(/\.[^./\\]+$/, '')}-stitched.${extension}`;
}
