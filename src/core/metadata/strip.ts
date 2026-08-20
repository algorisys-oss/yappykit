/**
 * Lossless metadata stripper.
 *
 * Removes EXIF/GPS/XMP/IPTC and comment blocks WITHOUT recompressing the image
 * — the compressed pixel data is copied through byte-for-byte, so the photo is
 * unchanged and only the metadata is gone. This is what tool #20 promises:
 * "permanently remove metadata", not "re-encode and hope".
 *
 * Pure functions over bytes → trivially testable and worker-ready.
 */

export type ImageKind = 'jpeg' | 'png' | 'unknown';

export function detectKind(bytes: Uint8Array): ImageKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'png';
  return 'unknown';
}

export interface StripResult {
  output: Uint8Array;
  kind: ImageKind;
  /** Bytes removed (original - output). 0 when nothing was stripped. */
  removedBytes: number;
  /** True when the format is supported and we could strip losslessly. */
  supported: boolean;
}

export function stripMetadata(bytes: Uint8Array): StripResult {
  const kind = detectKind(bytes);
  let output = bytes;
  let supported = true;
  if (kind === 'jpeg') output = stripJpeg(bytes);
  else if (kind === 'png') output = stripPng(bytes);
  else supported = false;
  return { output, kind, removedBytes: bytes.length - output.length, supported };
}

// JPEG marker segments we drop: APP1 (EXIF/XMP), APP13 (Photoshop/IPTC), and
// COM comments. We KEEP APP0 (JFIF) and APP2 (ICC colour profile) so colours and
// basic structure are preserved.
const STRIP_MARKERS = new Set([0xe1, 0xed, 0xfe]); // APP1, APP13, COM

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  // SOI
  out.push(bytes[i++]!, bytes[i++]!); // FF D8

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Not at a marker — corrupt/unexpected; bail out and keep the original.
      return bytes;
    }
    const marker = bytes[i + 1]!;

    // Start of scan: entropy-coded data follows to the end. Copy the rest as-is.
    if (marker === 0xda) {
      for (let k = i; k < bytes.length; k++) out.push(bytes[k]!);
      break;
    }
    // Standalone markers with no length payload (RSTn, EOI, TEM).
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(bytes[i]!, bytes[i + 1]!);
      i += 2;
      continue;
    }
    // Length-bearing segment: 2 bytes marker + big-endian length (incl. those 2).
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const segEnd = i + 2 + len;
    if (!STRIP_MARKERS.has(marker)) {
      for (let k = i; k < segEnd; k++) out.push(bytes[k]!);
    }
    i = segEnd;
  }
  return Uint8Array.from(out);
}

// PNG: drop ancillary metadata chunks (text + timestamp + raw EXIF), keep the
// critical ones (IHDR, PLTE, IDAT, IEND) and colour/gamma chunks.
const PNG_STRIP_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'tIME', 'eXIf']);

function stripPng(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let k = 0; k < 8; k++) out.push(bytes[k]!); // signature
  let i = 8;
  while (i + 8 <= bytes.length) {
    const len = (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const chunkEnd = i + 12 + len; // 4 len + 4 type + data + 4 crc
    if (chunkEnd > bytes.length) return bytes; // malformed — keep original
    if (!PNG_STRIP_CHUNKS.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(bytes[k]!);
    }
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  return Uint8Array.from(out);
}
