/**
 * Tools that are live but not yet thoroughly tested, shown with a Beta label on
 * their card and their page.
 *
 * An explicit list rather than "everything in the video category", so a tool
 * graduates by being removed here once it has been tested on real files, and a
 * tool outside video can be marked too. The video tools run a 30 MB engine over
 * whatever a phone or screen recorder produced, and the scanner's OCR is a second
 * engine; those are the ones most likely to meet a file nobody tried.
 */
import type { ToolKey } from '../i18n/routes';

export const BETA_TOOLS = [
  'video-compress',
  'video-trim',
  'video-blur',
  'video-annotate',
  'video-reframe',
  'video-mute',
  'video-extract-audio',
  'video-speed',
  'video-gif',
  'video-frame',
  'video-split',
  'video-join',
  'document-scan',
] as const satisfies readonly ToolKey[];

const BETA = new Set<ToolKey>(BETA_TOOLS);

export const isBeta = (key: ToolKey): boolean => BETA.has(key);
