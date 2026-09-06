/**
 * The short strings for each build guide: what goes in <head> and in a link.
 *
 * Split out from ./build-guides for one reason. `../i18n/meta` resolves the
 * metadata for EVERY route, so anything it imports lands in the bundle for
 * every page, the landing page included. Importing the guides from there put
 * seven thousand words of article text into the landing chunk and pushed it
 * from 42 KB to 56 KB gzipped, for content that page never renders.
 *
 * So the titles live here, the bodies live there, and ./build-guides imports
 * this rather than repeating it: still one source of truth for a guide's name.
 */
import type { BuildGuideTool } from '../i18n/routes';

export interface BuildGuideMeta {
  seoTitle: string;
  seoDescription: string;
  /** The page h1, and the link text on the hub. */
  title: string;
}

export const BUILD_GUIDE_META: Record<BuildGuideTool, BuildGuideMeta> = {
  'pdf-password': {
    seoTitle:
      'How We Built a PDF Password Tool That Runs in the Browser | YappyKit',
    seoDescription:
      'Building AES-256 PDF encryption entirely client-side with qpdf compiled to WebAssembly: choosing the engine, the cross-origin isolation it forces, and the three bugs that hang instead of failing.',
    title:
      'Building a PDF password tool that never uploads your file',
  },
  'image-compress': {
    seoTitle:
      'How We Built an Image Compressor That Hits an Exact Size | YappyKit',
    seoDescription:
      'Building a browser image compressor that takes a target file size instead of a quality slider: binary search over the encoder, why boundaries are probed first, and how the same engine drives video.',
    title:
      'Building a compressor you give a file size, not a quality slider',
  },
  'metadata-remove': {
    seoTitle:
      'How We Built a Lossless EXIF and Metadata Remover | YappyKit',
    seoDescription:
      'Stripping EXIF, GPS, XMP and IPTC from a photo in the browser without recompressing it: walking JPEG segments and PNG chunks byte by byte, and why re-encoding would be the wrong answer.',
    title:
      'Building a metadata remover that does not touch your pixels',
  },
  'sheet-convert': {
    seoTitle:
      'How We Built a CSV to Excel Converter That Survives Excel | YappyKit',
    seoDescription:
      'Converting CSV to XLSX in the browser: the byte order mark Excel needs, pinning leading zeros as text before Excel reformats them, detecting delimiters by consistency, and flagging formula cells.',
    title:
      'Building a CSV converter that survives contact with Excel',
  },
  'video-compress': {
    seoTitle:
      'How We Built a Video Compressor With ffmpeg in the Browser | YappyKit',
    seoDescription:
      'Running ffmpeg.wasm client-side to hit an exact file size: computing bitrate analytically instead of searching, and shipping a 30 MB engine past a 25 MB host limit.',
    title:
      'Building a video compressor that fits an exact size limit',
  },
  redact: {
    seoTitle:
      'How We Built a Redaction Tool That Actually Destroys the Text | YappyKit',
    seoDescription:
      'Redacting a PDF or photo in the browser by rasterising and burning the boxes into pixels, and why drawing a black rectangle over a PDF leaves the text in the file.',
    title:
      'Building redaction that destroys the text instead of hiding it',
  },
};
