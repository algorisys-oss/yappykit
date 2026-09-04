/**
 * What changed, per release.
 *
 * ENGLISH ONLY, for the same reason as ../content/articles: these are precise
 * technical statements, and a machine-translated approximation of a precise
 * statement is just a wrong statement. The panel that shows them is labelled in
 * the visitor's language; the entries themselves are not translated.
 *
 * Newest first. A release records what shipped, not the commit it shipped as:
 * the commit is stamped into the build (../version) and is therefore always the
 * one actually running, which a hand-written field would not be.
 *
 * Versioning began at 0.1.0. Everything before it shipped untagged, and the
 * history for that period is the git log rather than this file.
 */
export interface Release {
  version: string;
  /** ISO date the release was published to the mirror. */
  date: string;
  added?: string[];
  fixed?: string[];
}

export const RELEASES: Release[] = [
  {
    version: '0.1.0',
    date: '2026-09-04',
    added: [
      'Watermark tool: sign a photo in the corner, or tile a mark across a scan so it survives being cropped.',
      'Every tool page now says which browsers run it, worked out from what the tool actually needs rather than from a hand-kept list.',
      'Tool pages name the browsers that are genuinely better where that is a fact about the tool, and stay quiet where it would only be an opinion.',
      'This version panel, with a refresh button for when a new version is out and the old one is still cached.',
    ],
    fixed: [
      'Four tools overstated their browser support. The image compressor, screenshot stitcher and PDF compressor prefer an offscreen canvas that Firefox only shipped at 105, and the video compressor prefers WebCodecs that Firefox only shipped at 130. All four advertised the lower floor with no qualification.',
      'Tool pages carried two ARIA live regions, so a screen reader announced the browser support verdict as though it were the result of something you had just done.',
    ],
  },
];

/** The newest release, which is the one these notes are about. */
export const LATEST = RELEASES[0]!;
