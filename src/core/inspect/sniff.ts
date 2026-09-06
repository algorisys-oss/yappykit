/**
 * What a file actually is, from its first bytes.
 *
 * The extension is a claim the file makes about itself and is frequently wrong:
 * an iPhone photo renamed to .jpg is the common case, and it is exactly why an
 * upload gets rejected with an unhelpful error. The bytes do not lie, so the
 * inspector reads those and reports the difference.
 *
 * Formats are identified by their canonical MIME type. Names ("JPEG", "PDF")
 * are proper nouns and stay untranslated; everything the UI says ABOUT a file
 * is prose that lives in the locale bundles.
 */
import { isHeic } from '../image/heic';

export interface FileFormat {
  mime: string;
  /** How the format is written when a person names it. */
  format: string;
  /** Its usual extension, no dot. */
  ext: string;
}

export const FORMATS = {
  jpeg: { mime: 'image/jpeg', format: 'JPEG', ext: 'jpg' },
  png: { mime: 'image/png', format: 'PNG', ext: 'png' },
  gif: { mime: 'image/gif', format: 'GIF', ext: 'gif' },
  webp: { mime: 'image/webp', format: 'WebP', ext: 'webp' },
  avif: { mime: 'image/avif', format: 'AVIF', ext: 'avif' },
  heic: { mime: 'image/heic', format: 'HEIC', ext: 'heic' },
  bmp: { mime: 'image/bmp', format: 'BMP', ext: 'bmp' },
  tiff: { mime: 'image/tiff', format: 'TIFF', ext: 'tif' },
  ico: { mime: 'image/x-icon', format: 'Windows icon', ext: 'ico' },
  pdf: { mime: 'application/pdf', format: 'PDF', ext: 'pdf' },
  zip: { mime: 'application/zip', format: 'ZIP', ext: 'zip' },
  gzip: { mime: 'application/gzip', format: 'gzip', ext: 'gz' },
  sevenZip: { mime: 'application/x-7z-compressed', format: '7-Zip', ext: '7z' },
  rar: { mime: 'application/vnd.rar', format: 'RAR', ext: 'rar' },
  mp4: { mime: 'video/mp4', format: 'MP4', ext: 'mp4' },
  quicktime: { mime: 'video/quicktime', format: 'QuickTime', ext: 'mov' },
  webm: { mime: 'video/webm', format: 'WebM', ext: 'webm' },
  avi: { mime: 'video/x-msvideo', format: 'AVI', ext: 'avi' },
  mp3: { mime: 'audio/mpeg', format: 'MP3', ext: 'mp3' },
  wav: { mime: 'audio/wav', format: 'WAV', ext: 'wav' },
  ogg: { mime: 'audio/ogg', format: 'Ogg', ext: 'ogg' },
  flac: { mime: 'audio/flac', format: 'FLAC', ext: 'flac' },
  ttf: { mime: 'font/ttf', format: 'TrueType', ext: 'ttf' },
  otf: { mime: 'font/otf', format: 'OpenType', ext: 'otf' },
  woff: { mime: 'font/woff', format: 'WOFF', ext: 'woff' },
  woff2: { mime: 'font/woff2', format: 'WOFF2', ext: 'woff2' },
} as const satisfies Record<string, FileFormat>;

/** Extensions that mean the same format, so a correct name is not flagged. */
const ALIASES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe'],
  'image/heic': ['heic', 'heif', 'hif'],
  'image/tiff': ['tif', 'tiff'],
  'image/x-icon': ['ico', 'cur'],
  'video/quicktime': ['mov', 'qt'],
  'audio/mpeg': ['mp3', 'mpga'],
  'audio/ogg': ['ogg', 'oga', 'opus'],
  // A ZIP is the container under every modern office document, so the bytes
  // saying "ZIP" while the name says .docx is correct, not a discrepancy.
  'application/zip': [
    'zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp',
    'epub', 'jar', 'apk', 'kmz', 'xpi', 'whl',
  ],
};

const ascii = (b: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...b.subarray(at, at + length));

const startsWith = (b: Uint8Array, ...sig: number[]): boolean =>
  sig.every((byte, i) => b[i] === byte);

/** The format the bytes are, or null when nothing matches. */
export function sniff(head: Uint8Array): FileFormat | null {
  if (head.length < 4) return null;

  if (startsWith(head, 0xff, 0xd8, 0xff)) return FORMATS.jpeg;
  if (startsWith(head, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return FORMATS.png;
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return FORMATS.gif;
  if (startsWith(head, 0x42, 0x4d)) return FORMATS.bmp;
  if (startsWith(head, 0x49, 0x49, 0x2a, 0x00) || startsWith(head, 0x4d, 0x4d, 0x00, 0x2a)) {
    return FORMATS.tiff;
  }
  if (startsWith(head, 0x00, 0x00, 0x01, 0x00)) return FORMATS.ico;

  if (ascii(head, 0, 4) === 'RIFF') {
    const payload = ascii(head, 8, 4);
    if (payload === 'WEBP') return FORMATS.webp;
    if (payload === 'WAVE') return FORMATS.wav;
    if (payload === 'AVI ') return FORMATS.avi;
    return null;
  }

  if (ascii(head, 4, 4) === 'ftyp') {
    if (isHeic(head)) return FORMATS.heic;
    const brand = ascii(head, 8, 4).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return FORMATS.avif;
    if (brand.startsWith('qt')) return FORMATS.quicktime;
    return FORMATS.mp4;
  }

  if (ascii(head, 0, 5) === '%PDF-') return FORMATS.pdf;
  if (startsWith(head, 0x50, 0x4b) && (head[2] === 3 || head[2] === 5 || head[2] === 7)) {
    return FORMATS.zip;
  }
  if (startsWith(head, 0x1f, 0x8b)) return FORMATS.gzip;
  if (startsWith(head, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return FORMATS.sevenZip;
  if (ascii(head, 0, 4) === 'Rar!') return FORMATS.rar;
  if (startsWith(head, 0x1a, 0x45, 0xdf, 0xa3)) return FORMATS.webm;

  if (ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0)) {
    return FORMATS.mp3;
  }
  if (ascii(head, 0, 4) === 'OggS') return FORMATS.ogg;
  if (ascii(head, 0, 4) === 'fLaC') return FORMATS.flac;

  if (startsWith(head, 0x00, 0x01, 0x00, 0x00)) return FORMATS.ttf;
  if (ascii(head, 0, 4) === 'OTTO') return FORMATS.otf;
  if (ascii(head, 0, 4) === 'wOFF') return FORMATS.woff;
  if (ascii(head, 0, 4) === 'wOF2') return FORMATS.woff2;

  return null;
}

/** Whether the name promises one format while the bytes are another. */
export function extensionMismatch(fileName: string, format: FileFormat | null): boolean {
  if (!format) return false;
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = fileName.slice(dot + 1).toLowerCase();
  if (!ext) return false;
  return !(ALIASES[format.mime] ?? [format.ext]).includes(ext);
}
