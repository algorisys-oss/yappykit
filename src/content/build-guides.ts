/**
 * Build guides: how each tool was actually made.
 *
 * ENGLISH ONLY, for the same reason as ./articles: this is long technical
 * writing whose value is precision, and a machine-translated approximation of a
 * precise claim is just a wrong one. See BUILD_GUIDE_TOOLS in ../i18n/routes.
 *
 * These are deliberately a separate page per tool rather than more text on the
 * tool itself. Someone who came to compress a photo should not have to scroll
 * past a tutorial to reach the file picker; someone who came to read how it was
 * done should get a page that is only that.
 *
 * WRITE THEM ABOUT WHAT THE CODE ACTUALLY DOES, and about what went wrong. The
 * generic version of every one of these articles already exists on a hundred
 * blogs. The part nobody else can write is the specific decision this codebase
 * made and the specific bug that forced it, so lead with that. Every code
 * sample below is the real approach from the module it names, reduced to what
 * fits on a page.
 */
import type { BuildGuideTool } from '../i18n/routes';

export interface GuideSection {
  /** Stable anchor id, so a section can be linked to directly. */
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  code?: {
    /** What the reader is looking at, above the block. */
    caption: string;
    /** Informational only: highlighting is not shipped, this labels the block. */
    language: 'ts' | 'tsx' | 'bash';
    source: string;
  };
}

export interface BuildGuide {
  /**
   * One paragraph on what is being built and why it is not trivial.
   *
   * The title and the <head> strings are NOT here: they live in
   * ./build-guide-meta, so that route metadata can be resolved without pulling
   * these article bodies into every page's bundle.
   */
  intro: string;
  /** The libraries and browser APIs the tool actually uses. */
  stack: string[];
  sections: GuideSection[];
  /** The mistakes, kept separate because they are the most useful part. */
  pitfalls: string[];
}

export const BUILD_GUIDES: Record<BuildGuideTool, BuildGuide> = {
  'pdf-password': {
    intro:
      'This tool encrypts a PDF with AES-256 in the browser tab, with no server involved. The interesting part is not the encryption, which we did not write. It is everything around it: picking an engine, discovering that the engine drags a hard hosting requirement behind it, and three separate failure modes that all present as a spinner that never stops.',
    stack: [
      'qpdf 11, compiled to WebAssembly (qpdf-wasm), Apache-2.0',
      'Vite, for emitting the wasm and its glue as hashed assets',
      'pdf.js, used only in the test suite to verify the output',
      'Cloudflare Pages `_headers`, for per-route cross-origin isolation',
    ],
    sections: [
      {
        id: 'why-not-pdf-lib',
        heading: 'Step 1: the library you already have cannot do it',
        paragraphs: [
          'Every other PDF tool on this site uses pdf-lib, which is excellent and is already in the bundle. It cannot encrypt. That is not an oversight in pdf-lib; PDF encryption is a large, security-sensitive corner of the specification, and implementing it is a different project from manipulating page objects.',
          'So the first real decision was whether to implement it ourselves. The PDF standard fully specifies the algorithm, so it is possible. We did not, and the reasoning is worth stating because it generalises: implementing a cipher and its key-derivation for a security feature means writing cryptographic code, and a fully specified algorithm does not make hand-rolled crypto a reasonable thing to ship. If the choice is between a well-worn implementation and our own, it is not a close call.',
          'That narrowed it to compiling an existing PDF tool. qpdf has been in use for two decades, does AES-256, and is Apache-2.0, which is compatible with this repository. A WebAssembly build already existed on npm.',
        ],
      },
      {
        id: 'spike-first',
        heading: 'Step 2: spike it before writing a single line of UI',
        paragraphs: [
          'The package we found was version 0.1.0, published once, by one maintainer, with a 75-byte README and no API documentation whatsoever. Everything we know about it came from reading the minified Emscripten glue and running it.',
          'That is exactly the situation where writing the route, the copy and the tests first is a way to waste a day. The spike had one question: does this actually encrypt in a browser, and does a real reader then demand the password? Not "does it return without an error", which proves nothing about whether the output is protected.',
          'The verification step is the one people skip. Searching the output bytes for `/Encrypt` would pass on a file that merely claims to be protected. The test that means something is to open the result with a real PDF reader and check that it refuses.',
        ],
        code: {
          caption: 'The check that actually settles it, from the spike',
          language: 'ts',
          source: `// A zero exit code proves qpdf ran. It says nothing about whether
// the output is encrypted. Ask a real reader instead.
const open = async (password?: string) => {
  try {
    const doc = await pdfjs.getDocument({ data: bytes, password }).promise;
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => i.str).join('');
    return { opened: true, text };
  } catch (e) {
    return { opened: false, why: (e as Error).name };
  }
};

expect((await open()).opened).toBe(false);            // PasswordException
expect((await open('wrong')).opened).toBe(false);
expect((await open(PASSWORD)).text).toContain(CANARY); // and it is the same doc

// And the canary must not survive in the clear anywhere in the file.
expect(Buffer.from(bytes).toString('latin1')).not.toContain(CANARY);`,
        },
      },
      {
        id: 'shared-memory',
        heading: 'Step 3: the engine brings a hosting requirement with it',
        paragraphs: [
          'Reading the glue turned up one line that decided the architecture of the whole feature:',
        ],
        code: {
          caption: 'From the compiled qpdf glue',
          language: 'ts',
          source: `new WebAssembly.Memory({ initial: 1024, maximum: 32768, shared: true })`,
        },
      },
      {
        id: 'shared-memory-2',
        heading: 'Step 3 continued: what shared memory costs',
        paragraphs: [
          '`shared: true` means the module needs SharedArrayBuffer, and browsers only grant that to a cross-origin isolated page: one served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Those headers block most third-party resources, and advertising scripts are among them.',
          'So this tool cannot be on an ad-supported page. There is no way around it either, because 0.1.0 is the only published build and it is a pthreads build. The video tool has a single-threaded ffmpeg core to fall back to; there is no equivalent here.',
          'The site already had this problem once, for video, and had solved it by isolating exactly one route. We generalised that rather than adding a second special case: the header block is now generated from a list of tools that need isolation, for all twelve locales of each.',
        ],
        code: {
          caption: 'src/prerender/render.ts, generating the _headers block',
          language: 'ts',
          source: `// Each tool has a different URL in all twelve locales, and a stale
// hand-written list fails silently: ffmpeg quietly drops to
// single-threaded, and the PDF password tool hangs outright.
const isolatedTools = ['video-compress', 'pdf-password'] as const;

const isolated = isolatedTools
  .flatMap((tool) => SHIPPED_LOCALES.map((l) => pathFor(tool, l.code)))
  .map(
    (p) =>
      \`\${p}\\n  Cross-Origin-Opener-Policy: same-origin\` +
      \`\\n  Cross-Origin-Embedder-Policy: require-corp\`,
  )
  .join('\\n');`,
        },
      },
      {
        id: 'hangs',
        heading: 'Step 4: design for the failure mode, which is a hang',
        paragraphs: [
          'Run qpdf in a page that is not isolated and it does not throw. `callMain` never returns and the promise never settles. A `SharedArrayBuffer transfer requires self.crossOriginIsolated` error surfaces as an unhandled worker error, and then nothing else happens, forever.',
          'A promise that never settles is the worst possible way to tell somebody their browser cannot do something, and it is precisely what this site’s capability gate exists to prevent. So `crossOriginIsolated` is a hard required capability, checked before the file picker is even rendered, and the engine refuses rather than trusting the gate.',
        ],
        code: {
          caption: 'src/core/pdf/encrypt.ts',
          language: 'ts',
          source: `/**
 * Refuse, loudly, in a context where qpdf would hang.
 *
 * The capability gate should have kept the user off this tool entirely, so
 * reaching here means the gate was bypassed or the headers regressed. Either
 * way a thrown error is the only honest outcome; the alternative is a spinner
 * that never stops.
 */
function ensureIsolated(): void {
  if (!globalThis.crossOriginIsolated) throw new PdfPasswordError('notIsolated');
}`,
        },
      },
      {
        id: 'argv',
        heading: 'Step 5: driving a CLI that thinks it is on a desktop',
        paragraphs: [
          'qpdf-wasm is not a library with an API. It is the qpdf command-line program, with an in-memory filesystem. You write your input to a fake path, call `main` with an argv array, and read the output back out.',
          'The paths are fixed rather than derived from the user’s filename. Nothing outside the module can observe them, and a filename supplied by a user is the single string most likely to contain something an argument parser treats as an option.',
          'One password is set as both the user and the owner password. PDF allows them to differ, and that distinction is the source of most confusion about protected PDFs: a file with only an owner password opens for anybody who double-clicks it, while still being reported as password protected by every tool that inspects it. Offering that as a choice would be offering people a way to misunderstand their own file.',
        ],
        code: {
          caption: 'src/core/pdf/encrypt.ts',
          language: 'ts',
          source: `export function buildEncryptArgv(password: string): string[] {
  return [
    '--encrypt',
    \`--user-password=\${password}\`,
    \`--owner-password=\${password}\`,
    '--bits=256',
    '--',
    IN,
    OUT,
  ];
}

// --bits=128 selects RC4, which qpdf refuses to write without
// --allow-weak-crypto. That flag is never passed, so asking for 128
// fails outright rather than quietly producing a weaker file.`,
        },
      },
      {
        id: 'stderr',
        heading: 'Step 6: getting an error message out of it',
        paragraphs: [
          'To tell a wrong password from a corrupt file you need qpdf’s own diagnostics. Emscripten has a `printErr` option for exactly this. In this build it never fires; the messages go to `console.error` instead.',
          'Shimming `console.error` around the `callMain` call looks like the obvious fix and captures nothing at all. The module reads `console.error` once, while it is initialising, and holds that reference for the rest of its life. The collector has to be installed before `init`, which is a strange-looking piece of code that deserves the comment it has.',
        ],
        code: {
          caption: 'src/core/pdf/encrypt.ts',
          language: 'ts',
          source: `// The module reads console.error once, here, and keeps it. Patching it
// around callMain instead would capture nothing, which is how every
// failure ends up reported as a generic one. The global is restored
// immediately; the module keeps the collector it was handed.
const real = console.error;
console.error = (...args: unknown[]) => {
  stderr.push(args.map(String).join(' '));
  real.apply(console, args);
};
try {
  return await init({ noInitialRun: true, locateFile });
} finally {
  console.error = real;
}`,
        },
      },
      {
        id: 'testing',
        heading: 'Step 7: testing an engine that will not load in Node',
        paragraphs: [
          'The glue reads `self.location.href` at module scope, so importing it in Node throws before you can do anything. There is no unit-testing the encryption.',
          'The split we settled on is the one that split itself: everything pure is unit tested, and the encryption is covered by browser tests that assert through pdf.js. Argv construction, the 127-byte password limit, and the mapping from exit code and stderr to a user-facing reason are all ordinary functions over strings, and they carry twenty tests. The engine carries six browser tests, one of which exists only to assert that the page is cross-origin isolated, because if that goes red every other test in the file hangs for its full timeout and the reason would not be obvious.',
        ],
      },
    ],
    pitfalls: [
      'The local preview server did not apply the `_headers` file at all, so no isolated route had ever actually been isolated in a test run. ffmpeg did not care because it is single-threaded; this tool hung in every browser test until the server was taught to send the headers production sends.',
      '`locateFile` is asked for two files, not one. It resolves the wasm, and it also resolves the script the pthread worker re-loads by URL. Returning the filename unchanged sent the worker to `/qpdf.js` at the site root, where it 404s, and the engine then hangs rather than reporting anything.',
      'An early benchmark said a 5.6 MiB file took 60 seconds. That was the test harness marshalling a 5.6-million-element array over the browser automation protocol, not qpdf, which takes 126 ms. Time the call inside the page, not around the automation.',
      'A password longer than 127 bytes is truncated by the standard rather than rejected. Accept one and you hand back a file that opens with a prefix of what the user typed and refuses the rest. The limit is in bytes, so an emoji is four of them.',
      'The existing test that asserted no `.wasm` file survived the build was really asserting that the oversized ffmpeg core had been compressed. It only meant the same thing while ffmpeg was the only engine. It now asserts the rule it meant, which is about size.',
    ],
  },

  'image-compress': {
    intro:
      'Every image compressor has a quality slider from 1 to 100. Nobody wants a quality of 63. They want a photo under 100 KB because a form refuses anything larger. This tool inverts the control: you state the outcome, and the engine searches for the parameters. That search is the single most reused piece of code on the site, and it knows nothing about images.',
    stack: [
      'Canvas 2D and `createImageBitmap` for decoding and rescaling',
      '`canvas.convertToBlob` / `toBlob` for JPEG and WebP encoding',
      'OffscreenCanvas in a Web Worker where the browser supports it',
      'No third-party image library: the browser already has the codecs',
    ],
    sections: [
      {
        id: 'invert-the-control',
        heading: 'Step 1: decide what the user is actually asking for',
        paragraphs: [
          'A quality parameter is the encoder’s unit, not the user’s. The relationship between quality and file size depends on the image: a flat screenshot at quality 80 might be 40 KB while a detailed photograph at the same setting is 900 KB. Handing someone a slider is handing them a guessing game with a slow feedback loop.',
          'So the interface takes a budget, and the code solves for the rest. The consequence is that the compressor has to encode the image several times, which is only tolerable because it happens locally with no upload between attempts.',
        ],
      },
      {
        id: 'codec-agnostic',
        heading: 'Step 2: make the search know nothing about images',
        paragraphs: [
          'The engine is handed an `encode(params)` function and a byte budget, and returns the largest output that still fits. It has no idea whether it is driving a JPEG encoder or ffmpeg. That is what lets the video tool reuse it.',
        ],
        code: {
          caption: 'src/core/target-size/index.ts, the interface',
          language: 'ts',
          source: `export interface TargetSizeOptions {
  /** Codec bridge. Must be pure w.r.t. its params and honour \`signal\`. */
  encode: (params: EncodeParams, signal: AbortSignal) => Promise<Uint8Array>;
  /** Hard byte budget the output must fit under (e.g. 100 * 1024). */
  budgetBytes: number;
  searchSpace: {
    quality: Range;
    /** Omitted means never rescale. */
    scale?: Range;
  };
  strategy: 'binary' | 'analytic-then-verify';
  maxIterations?: number;
}`,
        },
      },
      {
        id: 'binary-search',
        heading: 'Step 3: binary search, with the boundaries probed first',
        paragraphs: [
          'Output size is monotonic in quality: raising quality never makes the file smaller. That is what makes binary search valid, and it is worth writing down because the whole approach collapses without it.',
          'The subtlety is where to probe. An implementation that only bisects the interior can miss a fit that lives exactly at the minimum quality, and then reports failure for an image it could have handled. So each scale level probes the cheapest possible output first: if even that overshoots, no amount of quality reduction will help and only rescaling can, which tells the loop what to do next.',
          'Every fitting probe is kept, so the engine can never return something worse than it already found, even if it runs out of iterations mid-search.',
        ],
        code: {
          caption: 'src/core/target-size/index.ts, the outer loop',
          language: 'ts',
          source: `for (;;) {
  // Cheapest possible output at this scale. If even this overshoots,
  // quality can't save us here — only scaling down can.
  const low = await probe(qRange.min);
  best = pickBest(best, low);

  if (low.withinBudget) {
    // Best possible output at this scale. If it fits, we're done.
    const high = await probe(qRange.max);
    best = pickBest(best, high);
    if (high.withinBudget) return high;
    // Otherwise the answer is between qMin and qMax: bisect.
  }
  // ... drop scale and repeat, if scaling is allowed
}`,
        },
      },
      {
        id: 'honest-output',
        heading: 'Step 4: report what it had to give up',
        paragraphs: [
          'A compressor that silently halves the dimensions of a photo to hit a budget has done something the user might not have accepted. The result carries a record of what was sacrificed, so the interface can say "scaled to 78%" instead of quietly handing back a smaller picture.',
          'The same structure covers honest failure. If nothing in the search space fits, the engine returns the smallest output it managed with `withinBudget: false`, rather than throwing. The user gets the best available answer and an accurate statement that it did not fit.',
        ],
      },
      {
        id: 'reuse',
        heading: 'Step 5: the payoff, on a completely different codec',
        paragraphs: [
          'Video cannot binary-search. A single encode of a two-minute clip takes long enough that a dozen attempts is not an option. But the required bitrate is calculable: a byte budget divided by a duration is a bitrate, so you can compute a first guess analytically and then verify it with one corrective re-encode.',
          'That is a second strategy inside the same engine, selected by a string, sharing all the budget accounting and result reporting. Because the search was written without any knowledge of images, adding video meant adding a strategy rather than writing a second engine.',
        ],
      },
    ],
    pitfalls: [
      'Binary searching only the interior of the quality range silently fails for images whose only fit is at the minimum. Probe the boundaries first.',
      'The search must be abortable. Each iteration is a full encode, and a user who changes the target halfway through should not wait for the old search to finish; every probe checks the abort signal before starting.',
      'A batch of large photos will exhaust memory if every decode is held at once. Decoding, searching and releasing one image at a time is slower to write and is the difference between working and crashing on a phone.',
      'Canvas silently returns a PNG when asked for a format it cannot encode. The output extension is therefore not evidence of the output format, and the tool checks the magic bytes rather than trusting the request.',
    ],
  },

  'metadata-remove': {
    intro:
      'Photographs carry more than they look like they do: the camera, the lens, the timestamp and very often the exact coordinates where the shutter opened. Removing that is easy to do badly. The naive approach is to decode the image and re-encode it, which does strip the metadata and also quietly degrades every pixel in the photo. This tool does not decode anything.',
    stack: [
      'No image library at all: plain `Uint8Array` walking',
      'The JPEG segment structure (JFIF markers) and the PNG chunk structure',
      'Web Workers, so a large batch does not freeze the page',
    ],
    sections: [
      {
        id: 'why-not-recompress',
        heading: 'Step 1: reject the obvious implementation',
        paragraphs: [
          'Draw the photo to a canvas and export it, and the metadata is gone. It is three lines of code and it is the wrong answer. Canvas export re-encodes the image, so a JPEG that was already lossy is now lossy twice, with visible degradation on gradients and edges. The user asked to remove information about the photo, not to alter the photo.',
          'The correct implementation treats the file as a container: the compressed pixel data is one part of it, the metadata is another, and the job is to copy the first while dropping the second. The pixels are never decoded, so they cannot be damaged.',
        ],
      },
      {
        id: 'jpeg-segments',
        heading: 'Step 2: walk the JPEG segment list',
        paragraphs: [
          'A JPEG is a sequence of segments, each introduced by a two-byte marker beginning `0xFF`. Most segments declare their own length, so you can step through them without understanding any of them. EXIF lives in `APP1`, XMP in another `APP1`, IPTC and Photoshop data in `APP13`, and comments in `COM`.',
          'The whole strip is therefore: copy segments through, skip the ones on the list, and stop walking at the start-of-scan marker because everything after it is entropy-coded pixel data that must be copied verbatim.',
          'That last detail matters. `0xFF` bytes occur inside compressed scan data, so continuing to parse for markers past the start of scan would find markers that are not there.',
        ],
        code: {
          caption: 'src/core/metadata/strip.ts, the shape of the walk',
          language: 'ts',
          source: `// Segments to drop: EXIF/XMP (APP1), IPTC/Photoshop (APP13),
// other APPn blocks, and comments.
while (i < bytes.length) {
  if (bytes[i] !== 0xff) break;
  const marker = bytes[i + 1];

  // Start of scan: everything from here is compressed pixel data.
  // Copy the rest verbatim and stop parsing.
  if (marker === 0xda) { copyRest(i); break; }

  const length = (bytes[i + 2] << 8) | bytes[i + 3];
  if (!DROP.has(marker)) copy(i, i + 2 + length);
  i += 2 + length;
}`,
        },
      },
      {
        id: 'png-chunks',
        heading: 'Step 3: PNG is easier, and stricter',
        paragraphs: [
          'PNG is a cleaner format for this: a signature followed by length-prefixed chunks, each with a four-character type and a CRC. Metadata lives in `tEXt`, `iTXt`, `zTXt`, `eXIf` and `tIME`, and the image data lives in `IDAT`.',
          'Because every chunk carries its own length and checksum, dropping one is genuinely just omitting it from the output. No CRC needs recomputing, because the CRCs are per chunk rather than over the file.',
        ],
      },
      {
        id: 'honest-about-unsupported',
        heading: 'Step 4: say so when you cannot help',
        paragraphs: [
          'A format the stripper does not understand is not something to guess at. Silently returning the input unchanged would tell the user their photo had been cleaned when it had not, which for this particular tool could matter a great deal.',
          'So the result carries whether the format was supported and how many bytes were actually removed. An unsupported file is reported as unsupported, and a file that genuinely had no metadata is reported as having had none, which are different statements and should not look the same.',
        ],
      },
    ],
    pitfalls: [
      'Re-encoding to strip metadata is the common implementation and it silently degrades the photo. If the output is a different size than "input minus the metadata", something has decoded your pixels.',
      'Parsing for markers past the JPEG start-of-scan finds false markers inside compressed data. Copy the remainder verbatim instead.',
      'Reporting "cleaned" for a format you did not understand is worse than reporting failure, because the user acts on it.',
      'Removing metadata does not anonymise a photograph. The image itself can still identify a place or a person, and this tool says so rather than implying otherwise.',
    ],
  },

  'sheet-convert': {
    intro:
      'Converting a CSV to a spreadsheet is one library call. That is exactly why there are a thousand converters and why most of them hand back a file that is subtly wrong. The call is the easy part. Everything that decides whether the output is usable happens on a machine the author never sees, when somebody else opens it in Excel.',
    stack: [
      'SheetJS (xlsx) for reading and writing workbooks',
      '`TextDecoder` and manual byte-order-mark handling',
      'Web Workers, since parsing a large sheet blocks the main thread',
    ],
    sections: [
      {
        id: 'the-bom',
        heading: 'Step 1: three bytes that decide whether names are readable',
        paragraphs: [
          'A UTF-8 CSV with no byte order mark opens in Excel on Windows as the system ANSI code page. Every accented character becomes mojibake: café arrives as cafÃ©. This is the single most common complaint about every CSV export ever written, and it is fixed by three bytes at the front of the file.',
          'It is on by default here, with an option to turn it off, because a small number of downstream systems reject the mark. Defaulting to the option that works in the tool most people will open the file with is the whole job.',
        ],
      },
      {
        id: 'excel-rewrites',
        heading: 'Step 2: stop Excel rewriting the data',
        paragraphs: [
          'Excel does not just display what it imports, it interprets it. A postcode of 01234 becomes the number 1234. A sixteen-digit order number becomes 1.23457E+15, and the original digits are gone rather than merely hidden. A product code of SEPT1 becomes a date. There is a well-known paper about this destroying gene names in published research.',
          'In a CSV there is nothing you can do about it, because a CSV has no type information: every value is text and Excel guesses. In an XLSX the type of every cell is recorded, so a value written as text stays text. That is the real argument for converting to a genuine workbook rather than renaming a CSV.',
          'The rule for what to pin is deliberately narrow. Marking every cell as text would stop real numbers being numbers and break every formula downstream, so only values that Excel would actually change are pinned, and the count is reported.',
        ],
        code: {
          caption: 'The shape of the check',
          language: 'ts',
          source: `// Values Excel would rewrite, and only those:
//   leading zeros      "01234"  -> 1234
//   long digit strings  16+ digits -> 1.23457E+15
//   date-like codes     "SEPT1" -> 1 September
// Everything else keeps its natural type, or every formula
// downstream breaks.
function needsTextPin(value: string): boolean {
  if (/^0\\d+$/.test(value)) return true;
  if (/^\\d{16,}$/.test(value)) return true;
  if (looksLikeAccidentalDate(value)) return true;
  return false;
}`,
        },
      },
      {
        id: 'delimiters',
        heading: 'Step 3: detect the delimiter by consistency, not by counting',
        paragraphs: [
          'The obvious way to detect a delimiter is to count candidates and pick the most frequent. It fails on the first file containing prose, because a column of sentences has more commas in it than a semicolon-separated file has semicolons.',
          'The signal that actually works is consistency: the right delimiter splits every line into the same number of fields. A wrong one produces a ragged row count. Scoring on that is barely more code and is right on the files where counting is wrong.',
        ],
      },
      {
        id: 'formula-injection',
        heading: 'Step 4: report the cells that are executable',
        paragraphs: [
          'A cell beginning with `=`, `+` or `@` is a formula to a spreadsheet, not text. A workbook built from data somebody else supplied is therefore a way of running their content on the machine that opens it. This is a real and well-documented class of attack.',
          'The tool counts those cells and tells you, and does not alter them. Silently rewriting somebody’s data to make it safe is its own kind of wrong: if a column legitimately contains formulas, mangling them without asking is a bug rather than a feature. Reporting is the honest position, and it puts the decision with the person who knows where the file came from.',
        ],
      },
    ],
    pitfalls: [
      'Converting only the first sheet of a workbook throws away the rest without saying so. A workbook with a sheet per month is the normal case, not the exception.',
      'Naming the CSV `.xlsx` does not make it a workbook, and does not stop Excel guessing types. The conversion has to be real for the type pinning to mean anything.',
      'Reading the file through a Blob makes the core untestable, because jsdom has no `Blob.arrayBuffer`. Taking bytes instead means the whole parser is testable in Node.',
      'Excel in many European locales expects a semicolon, because the comma is the decimal separator there. A comma-separated file opens as one column, and the user has no idea why.',
    ],
  },

  'video-compress': {
    intro:
      'Fitting a video under a size limit is the same problem as fitting an image under one, except that a single attempt can take a minute. The search strategy that works for images is unusable here, and the engine is large enough that shipping it at all turned into its own problem.',
    stack: [
      'ffmpeg.wasm (single-threaded core), so no cross-origin isolation is required',
      'The shared target-size engine, in its analytic-then-verify mode',
      '`DecompressionStream` for expanding the gzipped core at runtime',
    ],
    sections: [
      {
        id: 'cannot-search',
        heading: 'Step 1: you cannot binary search a video',
        paragraphs: [
          'The image compressor encodes a dozen times and keeps the best fit. For video that would mean twelve full transcodes, and a two-minute clip does not permit that.',
          'The saving grace is that video size is far more predictable than image size. Bitrate multiplied by duration is roughly file size, so you can compute a target bitrate directly from the budget instead of discovering it. One encode at that bitrate lands close, and a single corrective re-encode handles the overshoot.',
          'That is a second strategy in the same engine the image tool uses, which is why it was a small change rather than a second implementation.',
        ],
        code: {
          caption: 'The analytic first guess',
          language: 'ts',
          source: `// Bytes -> bits, minus what audio will take, spread over the duration.
// Close enough that one corrective pass usually finishes the job.
const audioBits = audioKbps * 1000 * durationSeconds;
const videoBits = budgetBytes * 8 - audioBits;
const videoKbps = Math.max(MIN_KBPS, videoBits / durationSeconds / 1000);`,
        },
      },
      {
        id: 'single-threaded',
        heading: 'Step 2: choose the slower core on purpose',
        paragraphs: [
          'ffmpeg.wasm has a multithreaded build, and it is meaningfully faster. It also needs SharedArrayBuffer, which needs cross-origin isolation, which blocks advertising scripts on the page that carries it.',
          'The first version of this tool deliberately took the single-threaded core: slower, but it runs anywhere, on any page, with no header requirements at all. Speed was the thing worth trading, because a tool that works everywhere and takes longer is better than a faster one that silently fails to start on a page configured slightly differently.',
          'The isolated route exists now, and the trade is documented in the headers file rather than in somebody’s memory.',
        ],
      },
      {
        id: 'size-limit',
        heading: 'Step 3: ship a 30 MB engine past a 25 MB limit',
        paragraphs: [
          'The ffmpeg core is 30.7 MiB. The host caps a single file at 25 MiB. This does not fail at build time; the site builds perfectly and the upload is rejected afterwards, which is the worst place for a limit to bite because nothing local catches it.',
          'The fix is a build step that gzips oversized wasm to 9.8 MiB and a loader that expands it with `DecompressionStream` before handing it to ffmpeg. The build step also fails loudly if anything still exceeds the limit, which moves the failure from the deploy back to the build where it belongs.',
          'The compressed file is named `.wasmz` rather than `.wasm.gz`, and that is deliberate. A server that recognises the `.gz` suffix may serve it with `Content-Encoding: gzip`, `fetch` would then decode it transparently, and the loader would try to decompress it a second time. An extension that nothing special-cases makes that entire class of bug unreachable.',
        ],
      },
    ],
    pitfalls: [
      'A limit enforced by your host at upload time is invisible to your build. Assert it in the build, or you will find out from a failed deploy.',
      'Naming a gzipped file `.gz` invites the server to decode it for you, which breaks a loader that expects to decode it itself.',
      'A first run downloads the engine, which is several megabytes even compressed. The interface has to say that is what is happening, or a long first wait looks like a hang.',
      'Duration has to come from the decoded video rather than from the container header, which is sometimes absent or wrong, and a wrong duration makes the analytic bitrate wrong by the same factor.',
    ],
  },

  redact: {
    intro:
      'Black rectangles over a PDF are how confidential documents get published with their secrets intact. It has happened to newspapers, law firms and governments, and it keeps happening because the failure is invisible: the page looks correct, and the text is still in the file, selectable by anyone who copies it out. This tool cannot fail that way, and the reason is that it throws away the document.',
    stack: [
      'pdf.js for rasterising PDF pages',
      'Canvas 2D for drawing the boxes and re-encoding',
      'pdf-lib for reassembling the redacted images into a PDF',
    ],
    sections: [
      {
        id: 'the-failure',
        heading: 'Step 1: understand why the common approach fails',
        paragraphs: [
          'A PDF is not a picture of a page, it is a list of drawing instructions. Adding a filled black rectangle adds one more instruction, on top of the ones that draw the text. The text instructions are still there, in order, with their coordinates. Copy and paste reads them. So does every text-extraction library ever written.',
          'Annotation tools in most PDF readers do exactly this, which is why redaction as an annotation is not redaction.',
        ],
      },
      {
        id: 'rasterise',
        heading: 'Step 2: rasterise, then draw, then discard the original',
        paragraphs: [
          'The approach that cannot leak is to render each page to pixels, draw the boxes onto those pixels, and build a new document out of the results. The text instructions are not covered; they are gone, because the page that contained them was replaced by an image of itself with the boxes already in it.',
          'The order matters and it is the whole trick: rasterise first, draw second, and never carry the original page objects into the output.',
        ],
        code: {
          caption: 'The pipeline, in outline',
          language: 'ts',
          source: `// 1. Render the page to a canvas. The text becomes pixels.
await page.render({ canvasContext: ctx, viewport }).promise;

// 2. Burn the boxes into those pixels.
ctx.fillStyle = '#000';
for (const box of boxes) ctx.fillRect(box.x, box.y, box.w, box.h);

// 3. Build the output from the IMAGE. The original page objects,
//    text instructions included, are never copied across.
const png = await canvas.convertToBlob({ type: 'image/png' });
out.addPage().drawImage(await out.embedPng(await png.arrayBuffer()));`,
        },
      },
      {
        id: 'the-cost',
        heading: 'Step 3: admit what it costs',
        paragraphs: [
          'The output is no longer searchable, no longer selectable, and larger than the input. That is a real loss and the tool says so up front rather than in a footnote.',
          'It is the correct trade for this particular job. A redacted document that is still searchable is a document whose redactions can be searched, and there is no version of this tool where the text survives and the redaction holds. Every other decision here follows from accepting that.',
          'The same pipeline handles photographs, where there was never any text layer to worry about, and the boxes are burned in for consistency rather than necessity.',
        ],
      },
      {
        id: 'testing-redaction',
        heading: 'Step 4: test it the way an attacker would read it',
        paragraphs: [
          'The tempting test is to search the output bytes for the secret string and assert it is absent. That test passes whether or not the tool does anything, because PDF content streams are Flate-compressed and a plain byte search cannot see text that is perfectly selectable when the file is opened.',
          'The test that means something extracts text the way a reader does. This site keeps a `pdfText` helper in its shared test fixtures for exactly this reason, and a comment above it explaining the trap, because it is the kind of mistake that gets made once per codebase.',
        ],
      },
    ],
    pitfalls: [
      'A byte search for the secret in a PDF proves nothing: content streams are compressed. Extract text with a real parser.',
      'Rasterising at screen resolution produces an unreadable document. The render scale has to come from what the output is for, not from the viewport.',
      'A large document rasterised all at once will exhaust memory. Pages have to be rendered, drawn and released one at a time.',
      'Redacting an image does not remove its metadata. The two tools are separate, and a redacted photo can still carry the coordinates where it was taken.',
    ],
  },
};
