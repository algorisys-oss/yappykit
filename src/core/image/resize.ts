/**
 * Resizing an image to exact pixel dimensions.
 *
 * "Exactly 1080 by 1080" is the outcome; how the picture gets there is the
 * decision the tool has to make honestly. A photo that is not already square
 * cannot become square without either losing some of itself or gaining a
 * border, and pretending otherwise means stretching, which is the one answer
 * nobody wants and every naive resizer gives.
 *
 * So there are two modes and no third. Cover fills the box and crops the
 * overflow, centred, which is what a profile picture or a thumbnail needs. Fit
 * puts the whole picture inside the box and pads the rest, which is what a
 * print slot or a form with a fixed frame needs. Stretch is not offered.
 *
 * The geometry is here, away from the canvas, so it can be tested against the
 * cases that actually go wrong: rounding, one-pixel targets, and upscales.
 */

export type FitMode = 'cover' | 'contain';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizePlan {
  /** The region of the source to draw, in source pixels. */
  source: Rect;
  /** Where that region lands on the target canvas. */
  dest: Rect;
  /** True when the target is bigger than the source in either direction. */
  upscaled: boolean;
  /** True when part of the source falls outside the target. */
  cropped: boolean;
  /** True when the target has ground showing that the source does not cover. */
  padded: boolean;
}

/** Sizes people are actually asked for, rather than a list of every format. */
export const PRESETS = [
  { id: 'square', labelKey: 'presetSquare', width: 1080, height: 1080 },
  { id: 'profile', labelKey: 'presetProfile', width: 400, height: 400 },
  { id: 'thumbnail', labelKey: 'presetThumbnail', width: 1280, height: 720 },
  { id: 'hd', labelKey: 'presetHd', width: 1920, height: 1080 },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];

export function presetLabelKeys(): string[] {
  return PRESETS.map((p) => p.labelKey);
}

const clampPositive = (n: number) => Math.max(1, Math.round(n));

/**
 * Work out what to draw where.
 *
 * Cover scales by the LARGER ratio so the box is filled and the excess is
 * trimmed; fit scales by the smaller so the whole picture survives and the
 * remainder is ground. Both centre what is left, because an off-centre default
 * is a decision the tool has no basis to make.
 */
export function planResize(source: Size, target: Size, mode: FitMode): ResizePlan {
  const width = clampPositive(target.width);
  const height = clampPositive(target.height);
  const upscaled = width > source.width || height > source.height;

  if (mode === 'cover') {
    const scale = Math.max(width / source.width, height / source.height);
    // The window of the source that maps onto the target, centred.
    const windowW = Math.min(source.width, Math.round(width / scale));
    const windowH = Math.min(source.height, Math.round(height / scale));
    return {
      source: {
        x: Math.max(0, Math.round((source.width - windowW) / 2)),
        y: Math.max(0, Math.round((source.height - windowH) / 2)),
        w: windowW,
        h: windowH,
      },
      dest: { x: 0, y: 0, w: width, h: height },
      upscaled,
      cropped: windowW < source.width || windowH < source.height,
      padded: false,
    };
  }

  const scale = Math.min(width / source.width, height / source.height);
  const drawW = clampPositive(source.width * scale);
  const drawH = clampPositive(source.height * scale);
  return {
    source: { x: 0, y: 0, w: source.width, h: source.height },
    dest: {
      x: Math.round((width - drawW) / 2),
      y: Math.round((height - drawH) / 2),
      w: drawW,
      h: drawH,
    },
    upscaled,
    cropped: false,
    padded: drawW < width || drawH < height,
  };
}

/** What to call the result, with its size in the name so copies stay apart. */
export function resizedName(name: string, size: Size, extension: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}-${size.width}x${size.height}.${extension}`;
}

export interface ResizeOptions {
  target: Size;
  mode: FitMode;
  type: 'image/jpeg' | 'image/png';
  /** Ground colour behind a fitted image. Ignored by cover, which has none. */
  background: string;
  quality?: number;
}

export interface ResizedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  plan: ResizePlan;
}

/**
 * Draw the plan onto a canvas and encode it.
 *
 * `imageSmoothingQuality: 'high'` matters here in a way it does not elsewhere:
 * this tool exists to change dimensions, so the resampling IS the product, and
 * the browser's default filter visibly stairsteps a large downscale.
 */
export async function resizeImage(
  bitmap: CanvasImageSource,
  source: Size,
  options: ResizeOptions,
): Promise<ResizedImage> {
  const plan = planResize(source, options.target, options.mode);
  const canvas = document.createElement('canvas');
  canvas.width = clampPositive(options.target.width);
  canvas.height = clampPositive(options.target.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');

  // JPEG has no alpha, so an unpainted canvas would encode as black. A fitted
  // image needs the ground painted anyway; covering paints it for free.
  if (options.type === 'image/jpeg' || options.background !== 'transparent') {
    ctx.fillStyle = options.background === 'transparent' ? '#ffffff' : options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    plan.source.x,
    plan.source.y,
    plan.source.w,
    plan.source.h,
    plan.dest.x,
    plan.dest.y,
    plan.dest.w,
    plan.dest.h,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, options.type, options.quality ?? 0.92),
  );
  if (!blob) throw new Error('This browser could not encode the image.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = { bytes, width: canvas.width, height: canvas.height, plan };
  canvas.width = 0;
  canvas.height = 0;
  return out;
}
