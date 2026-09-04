/**
 * What each tool needs from the browser.
 *
 * The declarations used to sit inside the route components, which meant only
 * the running tool could see them: the prerendered page could not say what a
 * tool needs, and a tool with no declaration at all was indistinguishable from
 * one that needs nothing. Both are answered here, in one table, which the
 * routes gate on and core/capability/support turns into a browser list.
 *
 * `required` missing means the tool cannot run and must say so. `preferred`
 * missing means it runs a slower or more manual path and should say that too.
 * Keep this honest: a capability listed here that the tool does not use makes
 * the support table lie in the cautious direction, which is still a lie.
 */
import type { CapabilitySpec } from '@core/capability';
import type { ToolKey } from '../i18n/routes';

export const TOOL_CAPABILITIES: Record<ToolKey, CapabilitySpec> = {
  // Canvas encode in a loop; a bitmap and an offscreen canvas make it quicker.
  'image-compress': { required: [], preferred: ['createImageBitmap', 'offscreenCanvas'] },
  'image-watermark': { required: [], preferred: ['createImageBitmap'] },
  'image-to-pdf': { required: [], preferred: ['createImageBitmap'] },
  'screenshot-stitch': { required: [], preferred: ['createImageBitmap', 'offscreenCanvas'] },
  'pdf-compress': { required: [], preferred: ['offscreenCanvas'] },
  // ffmpeg is WebAssembly, and its core ships gzipped to fit the host's
  // per-file limit, so expanding it is a hard requirement rather than a nicety.
  'video-compress': { required: ['wasm', 'decompressionStream'], preferred: ['webCodecs'] },
  // Reading the installed font list is Chromium-only. Everywhere else the tool
  // asks for a font file instead, which works and is simply more work.
  'font-coverage': { required: [], preferred: ['localFonts'] },
  'font-style': { required: [], preferred: ['localFonts'] },
  // Decodes what the camera gave you, including iPhone HEIC through wasm.
  'passport-photo': { required: [], preferred: ['createImageBitmap'] },
  // Same, plus optional OCR, which is another WebAssembly engine.
  'document-scan': { required: [], preferred: ['createImageBitmap', 'wasm'] },
  // Parsing and diffing in plain JavaScript.
  'spreadsheet-compare': { required: [], preferred: [] },
  'metadata-remove': { required: [], preferred: [] },
  'pdf-merge': { required: [], preferred: [] },
  'random-word': { required: [], preferred: [] },
  // Input and display tests: no file ever enters them.
  'mouse-test': { required: [], preferred: [] },
  'keyboard-test': { required: [], preferred: [] },
  ruler: { required: [], preferred: [] },
  // getUserMedia is universal at the baseline; what varies is the permission,
  // which core/media/diagnose reports at the moment it is refused.
  'camera-mic-test': { required: [], preferred: [] },
};
