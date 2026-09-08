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
    version: '0.13.0',
    date: '2026-09-08',
    added: [
      'A Markdown to PDF tool, at /markdown-to-pdf. Drop in a .md file or paste the text, and it is typeset as a document rather than dumped as monospaced text: headings sized by level with a rule under the top two, nested lists, blockquotes, fenced code blocks that wrap instead of running off the page, GFM tables whose columns are measured from their contents, and links written in as real annotations so they still work when clicked. Page breaks never leave a heading stranded at the foot of a page. Only the fourteen fonts every PDF reader already has are used, which keeps the file small and embeds nothing, and the cost of that is stated rather than hidden: text outside Latin and accented European, so CJK, Cyrillic, Greek, Hebrew and Arabic, cannot be drawn, and the tool names the exact characters it had to replace instead of handing back a page of question marks.',
    ],
    fixed: [
      'On seven tools the label above the file picker was not attached to the picker, so clicking the words did nothing: the image compressor, the metadata remover, the PDF compressor, the video compressor, the document scanner, the passport photo tool and the spreadsheet comparison. Only the button inside the control responded, while the other nineteen tools had always worked either way. All of them are now wired, which also means a screen reader announces the control by its label instead of as an unlabelled file input.',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-09-07',
    fixed: [
      'The new pages were only reachable from the footer. The home page now links to the full explanation from the "check it yourself" note, the About page links to it from its own summary of the same subject, and the explanation hands you on to the per-tool build guides. A link in a footer is somewhere a reader arrives by accident; these are where someone is already reading about the thing.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-09-07',
    added: [
      'Build guides, at /build: step-by-step accounts of how six of the tools here were actually made, including the engine choices, the real code and the mistakes. They are separate pages rather than more text on the tools, so anyone who just wants to drop a file in is not scrolled past a tutorial to reach it. English only, because they are long technical writing whose value is precision and a machine-translated approximation of a precise claim is just a wrong one.',
      'A page explaining how the whole site works, at /how-it-works. What actually runs where, why the engines are compiled rather than reimplemented, where a file lives while a tool runs, what does still touch the network, and the honest limits of doing this locally. It opens by telling you how to disprove the entire claim in your own browser, because every tool site that does upload your files also promises they are safe.',
      'A contact page, in all twelve languages, with a section on what we genuinely cannot do: we cannot recover a password you have lost or return a file you processed here, because we never had either. Those are consequences of how the site is built rather than policies, and saying so once is fairer than answering it one email at a time.',
    ],
    fixed: [
      'The site named two different operators. The footer said Algorisys Technologies while the About page, the Terms and the Privacy Policy described a personal project run by an individual. Algorisys Technologies is the operator, and is now named consistently everywhere, with the contact address held in one place so the four pages cannot drift apart again.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-09-06',
    added: [
      "Password-protect a PDF, and take the password back off. This is real encryption rather than a permissions flag: the contents are enciphered with AES-256 using a key derived from the password, so a reader without it has nothing to show. That is worth distinguishing, because a PDF can also be marked \"do not print\" or \"do not copy\" while remaining completely unencrypted, and those marks are a request to the reader software that any program may ignore. One password is set, used both to open the document and to govern permissions: a PDF can carry two, and a file with only an owner password opens for anybody who double-clicks it while still appearing as protected in every summary, which is the misunderstanding this tool exists not to ship. There is no cipher to choose, because AES-256 is the only defensible answer and the weaker RC4 options are refused outright. The password is asked for twice, since a typo in a field you cannot read produces a file that opens with something you do not know, and it is capped at the 127 bytes the standard actually holds rather than being silently truncated past that. The work is done by qpdf compiled to WebAssembly, on your device: neither the file nor the password is ever sent anywhere, which also means a forgotten password cannot be recovered by us or by anyone.",
    ],
  },
  {
    version: '0.10.0',
    date: '2026-09-06',
    added: [
      "Convert CSV to Excel and back. The conversion itself is a library call; the tool exists for the three ways the result is wrong on somebody else's machine, none of which are visible on the machine that did the converting. A UTF-8 CSV without a byte order mark opens in Excel on Windows as the ANSI code page, so an accented name arrives mangled: three bytes fix that and they are on by default. Excel also rewrites what it imports, turning a postcode of 01234 into 1234 and a sixteen-digit order number into 1.23457E+15 with the digits gone rather than merely hidden, so in an .xlsx those values are pinned as text before Excel can guess. The rule is deliberately narrow, because marking every cell as text would stop real numbers being numbers and break every formula downstream. Cells beginning with =, + or @ are formulas to a spreadsheet, which is how a workbook built from someone else's data runs their code on the machine that opens it; those are counted and reported rather than quietly rewritten, since editing your data uninvited is its own mistake. The delimiter is detected by which candidate splits every line into the same number of fields rather than by which appears most often, because prose beats a semicolon on a raw count. Every sheet of a workbook is converted, not just the first.",
    ],
  },
  {
    version: '0.9.0',
    date: '2026-09-06',
    added: [
      'Rename images in bulk. Number them in order, name them by the date each photo was taken, or tidy up the names they already have. Numbers are padded to the width of the batch, because a file manager sorts names as text and photo-10 otherwise comes before photo-2, which is the exact problem the tool exists to fix. Names are made safe for Windows, including the reserved device names it still refuses, and no two files can come out with the same name. Nothing is re-encoded: the bytes go into the archive untouched, which makes it the one image tool here that cannot cost any quality.',
      'An llms.txt at the root of the site, in the format proposed at llmstxt.org, generated from the same catalogue as the sitemap so it cannot list a tool that does not exist or miss one that does.',
    ],
    fixed: [
      'Every tool now has an automated browser test, and the checks run on every push. The browser suite had covered only the older tools, and one of its own tests had been failing unnoticed since 0.2.0 because nothing ran it.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-09-06',
    added: [
      'Crop an image by dragging the part you want. The resizer centre-crops, which is the only defensible default when a tool cannot know what the subject is; this is the answer for when the subject is off to one side. Ratios are worked out in pixels rather than in the fractions a selection is stored as, because a fraction is not a shape: half the width and half the height of a 2000 by 1000 photo is 2:1, not square, and that is the difference between a square crop and a nearly square one a platform rejects.',
      'Split a long screenshot into pieces that miss the text. An even division puts each cut wherever the arithmetic lands, which is as likely to be halfway down a line of characters as anywhere else. Each cut is allowed to move about a line and a half to the quietest row nearby, so it falls in the gap between paragraphs instead of through a word. Only the rows a cut could reach are read: scoring a whole 1,000 by 20,000 capture would mean 80 MB of pixels, and all but a few hundred of those rows were never candidates.',
      'A colour picker and palette extractor. Every swatch is a real pixel from the image rather than the average of a group, because the average of a red flower and a green leaf is a mud brown that appears nowhere in the picture. The shares are measured by assigning each pixel to its nearest swatch, since median cut gives its boxes equal populations by construction and reporting those would call a photo that is mostly sky evenly balanced. Each colour reports its WCAG contrast on white and on black, which is what decides whether text will read on it.',
      'The metadata cleaner now takes PDFs as well as photos, stripping the title, author, subject, keywords, creator, producer and both timestamps while copying the pages through untouched.',
      'The image compressor now takes several photos at once, returning a ZIP. Each image is decoded, searched and released one at a time, so a batch of large photos does not need all of them in memory together.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-09-06',
    added: [
      'Resize an image to an exact size. Give the width and height, and if the photo is not that shape it either crops to fill or gets a border. Which one is about to happen is stated before you press the button, and stretching is not offered at all: it is the only option that needs no decision, which is why other tools default to it and why a stretched face always looks wrong.',
    ],
  },
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
