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
    version: '0.6.0',
    date: '2026-09-06',
    added: [
      'Redact a document or photo. The boxes are burned into the pixels rather than drawn on top, so what was underneath is destroyed rather than covered. A black rectangle laid over a PDF hides text on screen while leaving it in the file, which is how documents get published with their secrets intact; this cannot fail that way, at the cost of the output no longer being searchable.',
      'PDF to images: every page as a JPG or PNG, at a resolution chosen by what the pictures are for rather than by a number of dots per inch.',
      'Clean up a spreadsheet: remove duplicate and blank rows, trim the stray spaces that break every lookup, and mask or delete the columns a recipient does not need. Trimming runs before the duplicate check, which is why duplicates that other tools miss are caught here.',
      'The PDF splitter can also split by file size. Pages are packed in order until the next one would not fit, measured rather than estimated, and nothing is re-encoded.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-09-06',
    added: [
      'The home page can say how many people used the tools in the last 30 days. The figure is counted when the site is built rather than by the page, so no visitor is measured to display it, and it is rounded down so it never overstates. It stays hidden until there is a number worth stating.',
      'Cloudflare Web Analytics now runs alongside Google Analytics to produce that figure. It sets no cookies, and like Google Analytics it does not run at all for visitors in the EEA or the UK. Both are named in the Privacy Policy.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-09-06',
    added: [
      'The tool list filters by kind: images, PDF, video, data and files, text and fonts, device tests. Every tool is still listed on the page itself, so nothing is hidden from a search engine or from a visitor without JavaScript.',
      'The PDF tools take a pasted file. A document copied in a file manager arrives on the clipboard the same way a screenshot does, so Ctrl+V works on the splitter, the merger and the compressor, and the file inspector accepts anything at all.',
      'The home page states how many tools there are, counted from the catalogue so it cannot go stale.',
    ],
    fixed: [
      'Borders were not drawing anywhere on the site. The utility classes only ever set a width, and a border with no style renders as nothing, so file inputs, result tables, tool cards and the footer rule were all flat. Every one of them has its outline back.',
      'The top of the home page had two lots of spacing doing the same job, which pushed the first line of text further down than it needed to be.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-06',
    added: [
      'PDF splitter: keep the pages you need, put them in the order you want, or split a document into one file per page. Pages are copied rather than re-rendered, so text stays selectable and each page keeps its own size.',
      'The page list is written the way a print dialog writes it, like 1-3, 7. Leaving the end open with 8- takes everything from page eight, and writing a span backwards, like 10-1, reverses the document.',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-09-06',
    added: [
      'The tools section on the home page says how many tools there are. The number is counted from the catalogue, so it cannot go stale the next time one ships.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-06',
    added: [
      'Paste an image straight into a tool with Ctrl+V, or Cmd+V on a Mac. Every tool that takes images accepts it, so a screenshot no longer has to be saved to disk first just to be picked up again.',
      'File inspector: what a file really is, read from its leading bytes rather than its name, and what it carries with it. The location a photo was taken, the author and producing software of a PDF, and whether a Word or Excel document contains a macro project.',
      'Image converter: HEIC from an iPhone, plus WebP, AVIF, PNG and JPEG, converted to whichever format the site in front of you accepts. Several at once, at full resolution, with the batch available as a single ZIP.',
    ],
  },
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
