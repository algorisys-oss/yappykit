/**
 * Canvas image codec — the ship-first encode path (docs/05-architecture.md).
 *
 * Runs entirely on-device with no WASM: decode → draw to a (scaled) canvas →
 * `canvas.toBlob(type, quality)`. Quality-per-byte is worse than the WASM
 * codecs (MozJPEG/WebP/AVIF) we'll add later behind the same interface, but it
 * works in every browser today and gives the target-size engine a real,
 * monotonic search surface. No bytes leave the tab.
 */
import type { EncodeParams } from '@core/target-size';
import { isHeic, heicToBitmap } from './heic';

export type RasterType = 'image/jpeg' | 'image/webp';

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  close(): void;
}

/** Decode a user-selected file to an ImageBitmap (with an <img> fallback). */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  // iPhone HEIC/HEIF: no browser decodes it, so transcode to a bitmap first.
  // Sniff the header rather than trusting the extension.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (isHeic(head)) {
    const bitmap = await heicToBitmap(file);
    return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  // Fallback: decode via <img>, then rasterise to a bitmap-like via canvas.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image'));
      el.src = url;
    });
    const bitmap = await createImageBitmapFromDrawable(img, img.naturalWidth, img.naturalHeight);
    return { bitmap, width: img.naturalWidth, height: img.naturalHeight, close: () => bitmap.close() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createImageBitmapFromDrawable(
  drawable: CanvasImageSource,
  w: number,
  h: number,
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(drawable, 0, 0, w, h);
  return createImageBitmap(canvas);
}

/** Encode an already-painted canvas. PNG ignores `quality` and keeps alpha. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: RasterType | 'image/png',
  quality?: number,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('Canvas encode failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Build an `encode(params)` bound to a decoded image and output type. */
export function makeEncoder(
  image: DecodedImage,
  type: RasterType = 'image/jpeg',
): (params: EncodeParams) => Promise<Uint8Array> {
  return async ({ quality, scale }: EncodeParams) => {
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(image.bitmap, 0, 0, w, h);
    return encodeCanvas(canvas, type, quality);
  };
}
