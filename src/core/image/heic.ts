/**
 * HEIC / HEIF support.
 *
 * HEIC (High Efficiency Image Container) is the default iPhone photo format —
 * a HEIF file whose image is HEVC-compressed. No browser decodes it natively,
 * so we transcode it to an ImageBitmap first (via libheif-wasm, lazy-loaded).
 * This is docs/10 #5: "not optional for a mobile-first product."
 *
 * `isHeic` is a pure magic-byte check (no I/O) so it unit-tests trivially and
 * runs synchronously on a pre-read header.
 */

// ISO-BMFF brands that mean "HEIC/HEIF image". AVIF is intentionally excluded:
// it's the same container family but browsers decode it natively.
const HEIC_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis',
  'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'msf1', 'heif',
]);

/** True if the bytes start with an ISO-BMFF `ftyp` box of a HEIC/HEIF brand. */
export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // bytes 4..8 must spell 'ftyp'
  if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

/** Transcode a HEIC/HEIF blob to an ImageBitmap (lazy libheif-wasm). */
export async function heicToBitmap(file: Blob): Promise<ImageBitmap> {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'bitmap' });
}
