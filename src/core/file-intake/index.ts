/**
 * File intake (STUB): drag-drop, picker, paste, OPFS staging, type sniffing.
 * Shared by all six MVP tools.
 *
 * Type sniffing reads magic bytes rather than trusting the extension — HEIC,
 * for instance, must be recognised even when named `.jpg`.
 *
 * TODO:
 *   - sniff via leading bytes (JPEG, PNG, WebP, AVIF, HEIC, PDF, ZIP/OOXML, ...)
 *   - stage large files in OPFS (capability-gated) to survive reloads
 *   - expose a single `IntakeResult` the tools consume
 */

export type SniffedType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/heic'
  | 'application/pdf'
  | 'application/vnd.openxmlformats' // xlsx/docx (zip container)
  | 'text/csv'
  | 'video/mp4'
  | 'unknown';

export interface IntakeResult {
  file: File;
  sniffed: SniffedType;
  /** OPFS path when staged there, else null (kept in memory). */
  opfsPath: string | null;
}

export async function sniffType(_file: Blob): Promise<SniffedType> {
  // TODO: read the first bytes and match magic numbers.
  throw new Error('sniffType: not implemented yet');
}
