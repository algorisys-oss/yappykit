/**
 * Just enough of the GIF format to put one on a timeline.
 *
 * A GIF cannot be loaded into a <video> element, so the trimmer has no way to
 * ask the browser how long one is or how big it is — the two things the
 * timeline needs before the user can do anything. Reading the frame delays out
 * of the file answers both, costs a few milliseconds, and avoids making anyone
 * download the 30 MB encoder just to see a duration.
 *
 * This walks the block structure only. It never decodes an image: the pixels
 * are ffmpeg's problem, and LZW is a great deal of code for a number we can
 * read off the headers.
 */

/**
 * Browsers render a delay this small as 100 ms instead.
 *
 * It is a compatibility rule from the animated-GIF era rather than anything in
 * the spec, but every major engine follows it, so a GIF full of zero delays
 * really does take ten seconds to play and the timeline has to say so.
 */
export const MIN_RENDERED_DELAY_CS = 10;

export interface GifInfo {
  width: number;
  height: number;
  frameCount: number;
  /** Per-frame delays in seconds, already clamped the way a browser plays them. */
  delaysSec: number[];
  durationSec: number;
}

const HEADERS = ['GIF87a', 'GIF89a'];

/** Colour table entry count from the low three bits of a packed field. */
const tableBytes = (packed: number) => 3 * (1 << ((packed & 0b111) + 1));

/** Read past a chain of length-prefixed sub-blocks, returning the new offset. */
function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let p = start;
  while (p < bytes.length) {
    const size = bytes[p] ?? 0;
    p += 1;
    if (size === 0) return p;
    p += size;
  }
  return p;
}

/** Parse a GIF's headers, or null if it is not a readable animated GIF. */
export function readGifInfo(bytes: Uint8Array): GifInfo | null {
  if (bytes.length < 13) return null;
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (!HEADERS.includes(signature)) return null;

  const byte = (at: number) => bytes[at] ?? 0;
  const u16 = (at: number) => byte(at) | (byte(at + 1) << 8);
  const width = u16(6);
  const height = u16(8);

  let p = 13;
  const screenPacked = byte(10);
  if (screenPacked & 0x80) p += tableBytes(screenPacked);

  const delaysSec: number[] = [];
  let pendingDelayCs = 0;

  while (p < bytes.length) {
    const block = byte(p);

    if (block === 0x3b) break; // trailer

    if (block === 0x21) {
      const label = byte(p + 1);
      if (label === 0xf9) {
        // Graphic control extension: the delay belongs to the frame that follows.
        pendingDelayCs = u16(p + 4);
        p = skipSubBlocks(bytes, p + 2);
      } else {
        p = skipSubBlocks(bytes, p + 2);
      }
      continue;
    }

    if (block === 0x2c) {
      const packed = byte(p + 9);
      let q = p + 10;
      if (packed & 0x80) q += tableBytes(packed);
      q += 1; // LZW minimum code size
      p = skipSubBlocks(bytes, q);

      const cs = pendingDelayCs <= 1 ? MIN_RENDERED_DELAY_CS : pendingDelayCs;
      delaysSec.push(cs / 100);
      pendingDelayCs = 0;
      continue;
    }

    return delaysSec.length > 0 ? finish() : null;
  }

  return delaysSec.length > 0 ? finish() : null;

  function finish(): GifInfo {
    return {
      width,
      height,
      frameCount: delaysSec.length,
      delaysSec,
      durationSec: delaysSec.reduce((a, b) => a + b, 0),
    };
  }
}
