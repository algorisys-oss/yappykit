/**
 * Converting an image from one format to another.
 *
 * The job is almost always to unblock an upload: a portal wants a JPEG and the
 * phone produced HEIC, or a design tool wants PNG and everything on hand is
 * WebP. So the outcome the tool asks for is the format, and the quality that
 * gets there is not the user's problem.
 *
 * Decoding is the shared path in canvas-codec (HEIC included, through wasm).
 * Encoding is canvas.toBlob, which has one trap worth knowing: asked for a type
 * it cannot write, it does not fail. It quietly returns a PNG. Offering a
 * format without checking what came back would hand people PNG bytes inside a
 * file named .avif, so support is probed by encoding one pixel and reading the
 * type of the result.
 */
import { decodeImage, encodeCanvas } from './canvas-codec';

export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

/** Offered in this order: the most compatible first, the smallest last. */
export const OUTPUTS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

const EXTENSIONS: Record<OutputFormat, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * High enough that the result is visually the same as the source, low enough
 * that a JPEG of a photograph is not pointlessly large. Ignored by PNG.
 */
export const QUALITY = 0.92;

/** The source name carrying the new format's extension. */
export function outputName(sourceName: string, format: OutputFormat): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${stem}.${EXTENSIONS[format]}`;
}

/** The formats a probe proved the browser can actually write. */
export async function detectOutputs(
  probe: (format: OutputFormat) => Promise<string>,
): Promise<OutputFormat[]> {
  const out: OutputFormat[] = [];
  for (const format of OUTPUTS) {
    // PNG is the fallback every other probe is measured against, and every
    // canvas writes it, so it is included without a claim it cannot support.
    if (format === 'image/png') {
      out.push(format);
      continue;
    }
    const produced = await probe(format).catch(() => '');
    if (produced === format) out.push(format);
  }
  return out;
}

/** Probe this browser by encoding a single pixel in each format. */
export function supportedOutputs(): Promise<OutputFormat[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return detectOutputs(async (format) => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.5));
    return blob?.type ?? '';
  });
}

export interface Converted {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Decode a file and re-encode it in `format`, at full resolution. */
export async function convert(file: Blob, format: OutputFormat): Promise<Converted> {
  const image = await decodeImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    // JPEG has no alpha, and an unpainted canvas is transparent black, which
    // shows up as a black background rather than the white people expect.
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image.bitmap, 0, 0);
    return {
      bytes: await encodeCanvas(canvas, format, QUALITY),
      width: image.width,
      height: image.height,
    };
  } finally {
    image.close();
  }
}
