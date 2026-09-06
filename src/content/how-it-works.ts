/**
 * "How it works": the technical explainer, as data.
 *
 * ENGLISH ONLY and served at one URL, for the same reason as ../content/articles:
 * the value of this page is entirely in the precision of its claims, and a
 * machine-translated approximation of a precise technical claim is just a wrong
 * one. See ROUTES['how-it-works'] in ../i18n/routes.
 *
 * This is the page every tool's privacy claim points at. It has to be specific
 * enough that a sceptical reader can check it — naming the actual APIs, the
 * actual engines, and the actual limits — because "your files never leave your
 * device" is exactly the sort of sentence that every upload-based competitor
 * also puts on its landing page.
 *
 * Held as data rather than JSX so the prerenderer and the Solid route render the
 * identical words, and so the whole thing is readable with JavaScript disabled.
 */

export interface ExplainerSection {
  /** Stable anchor id, so sections can be linked to directly and listed in a ToC. */
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export const EXPLAINER_UPDATED = '6 September 2026';

export const EXPLAINER_INTRO =
  'Every file tool on the internet says your files are safe. Most of them upload your file to a server first, which means you are trusting a promise. YappyKit does not upload, and the point of this page is that you should not have to take that on trust either: everything below is checkable from your own browser in about thirty seconds.';

export const EXPLAINER_SECTIONS: ExplainerSection[] = [
  {
    id: 'check-it-yourself',
    heading: 'Check it yourself, first',
    paragraphs: [
      'Before any explanation, here is the test. Open any tool on this site, press F12 or Cmd-Option-I to open your browser’s developer tools, and select the Network tab. Now run the tool on a real file. Watch the list of requests.',
      'You will see the page load: HTML, a stylesheet, some JavaScript, and on the heavier tools a WebAssembly binary of a few megabytes. You will not see a request carrying your file. There is no upload, no multipart form, no request whose size grows with the size of what you dropped in. If you want to be thorough, switch your browser to offline mode after the page has loaded and run the tool again. It still works, because at that point everything it needs is already on your machine.',
      'That last part is the one that cannot be faked. A tool that secretly uploaded your file would stop working the moment the network went away.',
    ],
  },
  {
    id: 'what-runs-where',
    heading: 'What actually runs where',
    paragraphs: [
      'A web page can run code in three places, and the distinction is the whole story.',
      'The first is a server. This is how nearly every online converter works: your browser sends the file over HTTP, a machine somewhere else does the work, and it sends a result back. The file is now on someone else’s disk, subject to their retention policy, their backups, their staff and their jurisdiction. Even an honest operator who deletes it within the hour has still had it.',
      'The second is JavaScript in the page itself. This has been able to read files since the File API landed, and it is genuinely local, but plain JavaScript is a poor fit for the heavy lifting: image codecs, PDF parsers and video encoders are decades-old C and C++ libraries, and rewriting them in JavaScript means either a slow reimplementation or a subtly incorrect one.',
      'The third is WebAssembly, and it is why this site can exist. WebAssembly is a compilation target: the same C and C++ libraries that a desktop application would link against are compiled to a binary format the browser executes at close to native speed. It is not a reimplementation of the library. It is the library.',
    ],
  },
  {
    id: 'why-webassembly',
    heading: 'Why WebAssembly changes the answer',
    paragraphs: [
      'The tools here are not clever approximations of desktop software. Where a real engine exists, it is the real engine, compiled:',
    ],
    bullets: [
      'Video compression runs ffmpeg, the same program that sits underneath most of the video pipeline on the internet.',
      'PDF password protection runs qpdf, a PDF library that has been in use and under scrutiny for two decades. The AES-256 encryption is qpdf’s, not something written for this site.',
      'PDF rendering runs pdf.js, the engine Firefox uses to display PDFs.',
      'Optical character recognition runs Tesseract, the long-standing open-source OCR engine.',
      'HEIC decoding, the format iPhones use for photos, runs a compiled decoder because browsers largely refuse to decode it natively.',
    ],
  },
  {
    id: 'never-hand-rolled',
    heading: 'What we deliberately do not write ourselves',
    paragraphs: [
      'The flip side of that list is a rule: where a job is security-sensitive or specification-heavy, we use an established implementation or we do not ship the tool.',
      'PDF encryption is the clearest example. The algorithm is fully specified and it would be entirely possible to implement it by hand. We do not, because writing your own cryptographic code for a security feature is the wrong call no matter how carefully it is written or how well the algorithm is documented. The same reasoning ruled out a background remover for a while: the best available model was licensed in a way incompatible with this project, and shipping a worse-but-compatible model was the honest option rather than ignoring the licence.',
      'This occasionally means a tool does not exist here that exists elsewhere. That is the intended trade.',
    ],
  },
  {
    id: 'where-your-file-lives',
    heading: 'Where your file actually lives while a tool runs',
    paragraphs: [
      'When you choose a file, the browser hands the page a File object. Reading it produces an ArrayBuffer: a block of memory inside the browser tab. That memory is passed to a Web Worker, a background thread, so that a large job does not freeze the interface, and from there into the WebAssembly engine’s own memory.',
      'At no point is there a URL involved. The file is not written to disk, not put in a cache, and not stored in the browser’s local storage. When you close the tab, the memory is released and nothing remains. The result you download is produced the same way: the finished bytes are wrapped in a Blob and handed to the browser as a download, which is a purely local operation.',
      'There is one consequence worth stating plainly, because it cuts against us as often as for us. If you password-protect a PDF here and forget the password, nobody can recover it. There is no copy on a server, no reset link and no account. The property that makes the tool safe is the same property that makes it unforgiving.',
    ],
  },
  {
    id: 'what-does-touch-the-network',
    heading: 'What does touch the network, honestly',
    paragraphs: [
      'Two different things happen on a page here, and conflating them would be the easiest way to mislead you.',
      'Your file is processed locally and never uploaded. The page itself is an ordinary web page: it is fetched from a server, and it may carry advertising and analytics scripts that make their own network requests, set cookies and see your IP address, exactly as they would on any ad-supported site. Your content is private. Your visit is about as private as any other page on the web.',
      'We say this here rather than burying it because a privacy claim that quietly overstates itself is worse than no claim. The Privacy Policy has the full detail. The short version is that the thing we promise about is the file, and that promise is structural rather than a policy we could change on a Tuesday.',
    ],
  },
  {
    id: 'capability-gate',
    heading: 'Why a tool sometimes refuses to run',
    paragraphs: [
      'Browsers differ enormously in what they can do. WebCodecs, OffscreenCanvas, SharedArrayBuffer, the Local Font Access API and WebGPU are all present in some browsers and absent in others, and a tool that assumes one of them will fail in a way that looks like a bug rather than a limitation.',
      'So every tool declares what it needs, and the site checks before offering it. If a required capability is missing, the tool says so instead of showing you a file picker that leads nowhere. If an optional one is missing, the tool still runs on a slower path and says that too. The per-tool pages list the browsers each tool works in, and those lists are generated from the declarations rather than written by hand, so they cannot drift away from what the code actually requires.',
      'Degrading honestly is a deliberate choice over degrading silently. A spinner that never finishes is the worst possible way to tell someone their browser cannot do something.',
    ],
  },
  {
    id: 'cross-origin-isolation',
    heading: 'Threads, shared memory, and the pages with no ads',
    paragraphs: [
      'Some engines need real threads. To use threads, WebAssembly needs shared memory, and to get shared memory a browser requires the page to be cross-origin isolated: served with the Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers, which together forbid the page from embedding most third-party resources.',
      'That is a genuine trade rather than a technicality, because the resources those headers block include advertising scripts. A page cannot be both cross-origin isolated and monetised in the usual way. Our answer is to isolate only the routes that need it and to keep those pages free of advertising, rather than to isolate the whole site or to drop the tools that require it.',
      'If you are curious which pages those are, you can see it in the response headers. The PDF password tool is one: qpdf’s WebAssembly build imports shared memory and there is no single-threaded fallback, so without isolation it cannot run at all.',
    ],
  },
  {
    id: 'limits',
    heading: 'The honest limits of doing it locally',
    paragraphs: [
      'Local processing is not strictly better than server processing, and pretending otherwise would undermine the rest of this page.',
      'The ceiling is your device. A phone with limited memory will struggle with a file that a laptop handles easily, and the failure mode of running out of memory in a browser tab is abrupt. A server-based tool can throw a large machine at a large file; we cannot. Video encoding in particular is slower here than it would be on a server with hardware acceleration, because it is running on your CPU through a compiled encoder.',
      'The first run of a heavy tool also has to download its engine, which can be several megabytes. That download happens once and is then cached, which is why the second use feels instant and why the tools keep working offline afterwards, but the first time is a real wait on a slow connection.',
      'What you get in exchange is that the file never leaves, there is no upload time, there is no file-size limit imposed by someone else’s server, and there is no retention policy to read. For the everyday jobs these tools cover, that is the better trade. For a two-hour 4K video it may not be, and we would rather say so.',
    ],
  },
  {
    id: 'open-source',
    heading: 'You can read the code',
    paragraphs: [
      'The claims on this page are checkable in two ways. The Network tab shows you the behaviour. The source shows you the mechanism: the site is published under the AGPL-3.0 and the repository is linked in the footer, so the processing code for every tool can be read, and the absence of an upload can be confirmed rather than believed.',
      'That is the strongest form of the claim we can make. Not that we promise not to look at your files, but that the architecture gives us nothing to look at.',
    ],
  },
];
