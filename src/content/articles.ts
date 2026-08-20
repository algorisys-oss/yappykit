/**
 * The per-tool technical article.
 *
 * docs/06 calls this "the differentiating asset": the thing that separates a
 * thin tool page from one that earns links. A bare upload-process-download page
 * is what Google's publisher policies prohibit ads on, and a paragraph of
 * marketing does not fix that. These explain the mechanism.
 *
 * ENGLISH ONLY, and rendered only on the English pages. Long-form technical
 * writing is the worst possible candidate for machine translation: the value is
 * entirely in precision, and a translated approximation of a precise claim is
 * just a wrong claim. The same reasoning keeps ../content/terms and
 * ../content/privacy to one language.
 *
 * Held as data, like the legal pages, so the route and the prerenderer render
 * one source and cannot drift.
 *
 * WRITE THEM ABOUT WHAT THE CODE ACTUALLY DOES. Every article below describes
 * this implementation, not the general topic: the search loop in
 * core/target-size, the rejection sampling in core/words, the DOMException
 * names in core/media. That is the part a reader cannot get from a competitor,
 * and it is what makes the page worth linking to.
 */
import type { ToolKey } from '../i18n/routes';

export interface ToolArticle {
  heading: string;
  paragraphs: string[];
}

export const ARTICLES: Partial<Record<ToolKey, ToolArticle>> = {
  'image-compress': {
    heading: 'Why "quality 80" is not a file size',
    paragraphs: [
      'Every image compressor offers a quality slider, and the number on it tells you almost nothing about the file you will get. JPEG quality is not a ratio or a target. It selects a quantisation table, which decides how aggressively the encoder discards detail in each block of the image. How much smaller that makes the file depends entirely on what is in the picture.',
      'A photograph of a clear sky compresses enormously, because neighbouring pixels are nearly identical and the encoder can describe large areas cheaply. A photograph of gravel, foliage or a crowd does not, because there is genuine detail in every block and quantisation has less to throw away. The same quality 80 can produce a 90 KB file from one and a 900 KB file from the other. This is why "compress to quality 80" is a setting and "get this under 100 KB" is a job, and why asking a person to guess the first in order to achieve the second is a bad interface.',
      'So this tool does not ask. You state the size you need, and it searches for the quality that lands under it. Encode, measure the real byte count, adjust, repeat. It is a bisection over the quality axis: each attempt tells the search which half of the remaining range to keep, and a handful of encodes converges on the highest quality that still fits. The number of attempts is bounded, and the result is the actual encoded file rather than an estimate, because the only reliable way to know how big a JPEG is is to produce it.',
      'Two things fall out of that design. The first is that resolution is part of the answer. Below a certain size, no quality setting will fit a 12 megapixel photograph into 20 KB while leaving it recognisable, and the honest move is to reduce the dimensions rather than destroy the detail. The second is that the search runs on your device. Every one of those trial encodes happens in your browser, which is why the file never needs to be uploaded, and why the tool can afford to try repeatedly: nobody is paying for the CPU by the second.',
      'If you are choosing a format rather than a size: WebP typically lands 25 to 35 percent below JPEG at visually equivalent quality, and AVIF lower still, but both are slower to encode and JPEG remains the format that every government portal and recruitment site will definitely accept. When a form says "JPEG under 100 KB", it means it.',
    ],
  },

  'video-compress': {
    heading: 'Video size is bitrate multiplied by time, and nothing else',
    paragraphs: [
      'The arithmetic of video is simpler than people expect and it is the whole game. A video file is approximately its bitrate multiplied by its duration. Nine megabits per second for ten minutes is about 675 megabytes, and no amount of choosing "high quality" in a menu changes that relationship. If you need a two minute clip to fit under 16 MB for WhatsApp, you have roughly 1,000 kilobits per second to spend, and every decision after that is about how to spend them.',
      'This is why a quality slider on a video encoder is a worse interface than it is on an image encoder. With a still image you can encode, measure and retry in a fraction of a second. A video encode is minutes of work, so guessing a setting and discovering the result was 40 MB is expensive in a way that guessing at a JPEG is not. The size has to be planned before the encode, not discovered after it.',
      'So this tool works backwards from the target. It takes the duration, subtracts what the audio track needs, and derives the video bitrate that fits the remaining budget, then encodes once at that bitrate. The audio matters more than people expect at small targets: 128 kbps of stereo AAC over ten minutes is about 9.6 MB, which is most of a WhatsApp limit before a single frame of video is encoded. At aggressive targets, dropping the audio to mono at 64 kbps buys back more than any video setting will.',
      'Where the budget per second gets genuinely small, resolution has to come down too. Bitrate is spread across pixels, so 1,000 kbps looks acceptable at 640x360 and looks like a smear of blocks at 1920x1080. The encoder has the same number of bits either way; the question is whether it is describing two million pixels per frame or two hundred thousand. Reducing resolution is not giving up, it is spending the budget where it survives.',
      'The encoding runs in your browser through ffmpeg compiled to WebAssembly. That engine is about 30 MB, which is why it loads only when you actually compress something and never on the landing page. It is also why the video route is the one page on this site served with cross-origin isolation: threaded WebAssembly needs SharedArrayBuffer, and SharedArrayBuffer needs headers that would break ordinary advertising scripts, so that route gets them and no other route does.',
    ],
  },

  'pdf-compress': {
    heading: 'What is actually large inside a PDF',
    paragraphs: [
      'A PDF is a container, and the reason one is 40 MB is almost never the text. Text is stored as glyph references and font programs, and even a long document rarely spends more than a few hundred kilobytes on them. The size is in the images: scanned pages, photographs, screenshots and logos, each stored at whatever resolution it was placed at, which for a phone-scanned document is often far higher than anything the page can display.',
      'That leads to the single most useful distinction when shrinking a PDF, and the one most tools hide from you. Downsampling and recompressing the images inside a PDF keeps the document a document: the text stays text, remains selectable, remains searchable, and still works with a screen reader. Rasterising the pages, which is what "maximum compression" usually means, converts every page to a flat picture. The file gets much smaller and the text stops being text.',
      'The difference matters most in exactly the situations where people compress PDFs. A visa application, a tender submission or a court filing may be checked by software that reads the text. A rasterised page passes a size check and fails everything else, silently, and you find out later. So this tool downsamples images first and reports what it did, and if hitting your target genuinely requires rasterising, it says so before it does it rather than after.',
      'The other lever is what resolution the images need to be. A page destined for a screen or an ordinary office printer gains nothing from 600 dots per inch of scan data. 150 DPI is generally indistinguishable on screen, and often halves or quarters the file on its own. Where a scan is a photograph of a white page, converting it to greyscale removes two thirds of the colour data at essentially no cost to legibility.',
      'As with everything here, the work happens in your browser. That matters more for PDFs than for most formats, because the documents people need to compress are disproportionately the ones they should not be uploading: bank statements, medical records, identity documents, contracts under NDA.',
    ],
  },

  'metadata-remove': {
    heading: 'What a photograph carries besides the photograph',
    paragraphs: [
      'Every photograph your phone takes carries a block of EXIF metadata, and its contents surprise most people. The GPS coordinates where the shutter fired, to a precision of a few metres. The exact date and time, to the second. The camera make, model and serial number. The lens. The software version. On many devices, a thumbnail of the original image, which survives even when the visible image has been cropped or edited.',
      'The serial number is the field people never think about, and it is the one that links photographs together. Two images posted to different places under different names, with no visible connection, share a camera serial and are therefore the same camera. Researchers and law enforcement both use exactly this. The GPS field is more obvious and no less consequential: a photograph of an item for sale, taken at home, publishes your home.',
      'Where this leaks is not usually social media. The large platforms strip EXIF on upload, which has trained people to assume it is handled. It is not handled anywhere else: email attachments keep it, messaging apps that send "as a document" keep it, marketplace listings on smaller sites keep it, and a file handed to someone on a USB stick obviously keeps it. The habit of assuming the platform will clean up is the risk.',
      'Stripping metadata is not the same as re-encoding. This tool rewrites the container and drops the metadata segments, leaving the compressed image data untouched, so the picture that comes out is bit-for-bit the picture that went in. Re-encoding would degrade the image slightly on every pass and would be the wrong tool for a job that is purely about what is attached to the file.',
      'One field is worth keeping deliberately: orientation. EXIF orientation tells a viewer to rotate the image, and removing it without applying the rotation first produces photographs that arrive sideways. That rotation is applied rather than discarded, which is the difference between a file that is clean and a file that is clean and still correct.',
    ],
  },

  'spreadsheet-compare': {
    heading: 'Why comparing two spreadsheets is harder than comparing two files',
    paragraphs: [
      'Diffing text is a solved problem: line by line, in order, and the answer is unambiguous. Spreadsheets defeat that immediately, because the row order carries no meaning. Export the same data twice from the same system and the rows may arrive in a different sequence, at which point a line-based diff reports that every row changed. It is technically correct and completely useless.',
      'So a spreadsheet comparison has to start by deciding what makes two rows the same row. That is the key column: an id, an SKU, an email address, an invoice number, whatever uniquely identifies a record in your data. Rows are matched on the key, then compared field by field. Choosing the key is the one decision the tool cannot make for you, and choosing it wrongly is the reason most comparisons produce nonsense. If the key is not unique, two different records collide and the differences reported between them are meaningless.',
      'The second trap is numeric equality. Spreadsheets store numbers as IEEE 754 doubles, and values that are equal in arithmetic are frequently not equal in bits. 0.1 plus 0.2 is not 0.3 in any language that uses doubles, including the one your spreadsheet application is written in. Compare two exported price lists with exact equality and you will find "differences" of one ten-billionth of a rupee scattered through them. A comparison that is useful for money needs a tolerance, and the tolerance needs to be visible so you know what it is treating as identical.',
      'Formatting is the third. A cell holding the number 1000 and a cell holding the text "1,000" look the same to a person and are not the same value. Dates are worse: a date is a number with a display format, and the same underlying day can appear as 08/20/2026, 20-08-2026 or 46,258 depending on locale and format. Comparing what is displayed rather than what is stored produces false differences; comparing what is stored without normalising produces the opposite.',
      'All of this runs in your browser, which for this tool is usually the point. The files that people most need to reconcile, bank statements against ledgers, supplier price lists, payroll exports, are exactly the files that should not be uploaded to a stranger to answer a question as small as "what changed".',
    ],
  },

  'passport-photo': {
    heading: 'Why passport photographs get rejected',
    paragraphs: [
      'Passport and visa photograph rejections are rarely about the photograph being bad. They are about measurements. Almost every authority specifies the head height as a proportion of the image, and that proportion is what an automated check measures first. The US requires the head to occupy between 50 and 69 percent of the frame height. The UK and the Schengen area measure the crown-to-chin distance in millimetres against a 45 mm tall print. India specifies a square photograph with its own ratios.',
      'This is why cropping a nice portrait to the right pixel dimensions fails. Getting a 2x2 inch image at 600x600 pixels satisfies the file specification and says nothing about where the head sits inside it. A photograph where the head is too small, which is the usual mistake because people frame like a normal portrait, is rejected by a system that never looked at the image quality at all.',
      'The second most common cause is the background. Requirements ask for plain white or off-white, evenly lit, with no shadow. A wall photographed with a flash produces a bright disc behind the head and darker corners, which is not an even background. A wall photographed without a flash usually produces a shadow on the side away from the window. Neither is a difficult problem to see once you know to look for it, and both are invisible to someone checking whether the picture looks nice.',
      'Then there are the rules that are simply lists: no smile showing teeth for most authorities, eyes open and clearly visible, no glasses for many countries now, head straight rather than tilted, mouth closed, no hair across the eyes, no uniform, plain everyday clothing, and no head covering except for religious reasons with the full face still visible. Each one is a separate reason a submission comes back weeks later.',
      'What this tool does is measure rather than guess. It works from the crop you place, computes the resulting head-height ratio against the specification you selected, and shows you the numbers you are being judged on before you submit. It cannot photograph you against a better wall, and it will not pretend that a rule about glasses is something software can fix.',
    ],
  },

  'document-scan': {
    heading: 'Scan quality decides OCR accuracy, and nothing downstream recovers it',
    paragraphs: [
      'Optical character recognition is often blamed for errors that were created before it ran. OCR works by isolating shapes and matching them against learned letterforms, so its accuracy is bounded by how cleanly the shapes can be isolated. If the characters are blurred, skewed, unevenly lit or fighting a patterned background, no amount of post-processing recovers information that the image never contained.',
      'The dominant factor is effective resolution on the text itself, not the megapixels of the camera. Roughly 300 dots per inch across the printed page is where accuracy stops improving much; well below 200, error rates climb sharply because the strokes that distinguish similar glyphs stop being resolved. This is why a 12 megapixel photograph taken at an angle from half a metre away often reads worse than a modest flatbed scan: the pixels exist but few of them are on the text.',
      'The second factor is contrast and evenness. A phone photograph of a page usually has a gradient across it, brighter near the window and darker at the far edge, plus the shadow of the phone itself. A global brightness threshold then either loses the pale text or fills the dark side with noise. The fix is adaptive thresholding, which computes a threshold for each neighbourhood of the image rather than one for the whole page, which is why the cleaning step here handles a lit-from-one-side photograph far better than a contrast slider does.',
      'Skew matters more than it appears to. A page rotated by three degrees still looks fine to a person, but line-finding algorithms segment text into rows, and a slope means a row crosses between lines of text. Deskewing before recognition is often the single largest accuracy gain available on phone-captured documents.',
      'A word on what a searchable PDF actually is, because it is widely misunderstood. It contains the page image exactly as before, plus a layer of invisible text positioned over the words. Your viewer draws the picture and searches the text. This means the recognition errors are still in the file, invisible, and a search for a word the OCR misread will not find it even though you can plainly see the word on screen. Searchable does not mean corrected.',
    ],
  },

  'mouse-test': {
    heading: 'What double-clicking by itself actually is',
    paragraphs: [
      'A mouse button is a mechanical switch, and mechanical switches bounce. When the contacts close they do not close once, cleanly. They make and break contact several times over a few milliseconds as the metal settles. Every mouse contains debounce logic, in firmware, that ignores further transitions for a short window after the first, which is what turns a messy physical event into one clean click.',
      'A worn switch bounces for longer than that window. The contacts oxidise, the spring weakens, and the settling time grows past the debounce period until a second transition arrives after the firmware has stopped ignoring them. The mouse then reports a second click that your finger never made. This is why the failure appears gradually, why it worsens over months, and why it happens to the left button first: it takes the most actuations.',
      'The measurable signature is the interval. A human double click has a gap between the two clicks in the range of roughly 80 to 500 milliseconds, bounded by how fast a finger can move. Switch chatter produces a second click within a few milliseconds of the first, usually under twenty, which no finger can do. That threshold is what separates a diagnosis from a guess, and it is what this tool measures: not whether a double click happened, but how long after the first click the second one arrived.',
      'The same timing view answers a different question people often have, which is whether the mouse is dropping clicks rather than adding them. A dropped click is a press with no release, or a release with no press, and it shows up in the raw event stream as an unmatched pair rather than as a short interval.',
      'Polling rate is a separate axis and worth not confusing with this. A 125 Hz mouse reports its position every 8 milliseconds and a 1000 Hz mouse every 1 millisecond, which affects how smooth the cursor feels and has nothing to do with whether the button chatters. A high polling rate on a worn switch is a fast report of a wrong click.',
    ],
  },

  'keyboard-test': {
    heading: 'Rollover, ghosting, and why your keyboard drops the third key',
    paragraphs: [
      'Keyboards do not have a wire per key. That would need over a hundred connections, so keys are wired as a grid of rows and columns and the controller scans it, energising one row at a time and reading which columns respond. A key at the intersection of row three and column five is identified by being the thing that connects them. This is efficient and it has a specific failure.',
      'Hold three keys that share rows and columns in the wrong arrangement, and the current finds a path through the other two that is indistinguishable from a fourth key being pressed. The controller reports a key nobody touched. That phantom is called ghosting, and the cheap defence against it is blocking: when the controller detects an ambiguous pattern it refuses to report the third key at all. Blocking is why a key you are definitely pressing does nothing, and it is far more common than ghosting because most manufacturers choose to drop input rather than invent it.',
      'The fix in hardware is a diode at every key, which makes current flow one way only and removes the phantom path. Keyboards advertising N-key rollover have those diodes. Keyboards advertising six-key rollover usually do not; six is the number of simultaneous keys the standard USB keyboard report can carry, and is a protocol limit rather than a matrix one. This is why the distinction matters to anyone gaming or playing a software instrument, and why it is invisible to anyone typing prose, where three simultaneous keys is already unusual.',
      'There is a second thing this tool tests that has nothing to do with rollover, which is layout. Browsers expose two different identifiers for a keystroke. One is the character produced, which depends on the layout, so the same physical key gives "a" on QWERTY and "q" on AZERTY. The other is the physical key position, which is the same everywhere. Testing has to track the physical position or the diagram lights up the wrong key for anyone not on a US layout, and where the browser can report your actual layout the printed legends are relabelled to match rather than showing you someone else keyboard.',
      'Keystrokes are read to drive the display and are never stored or transmitted, which is worth stating plainly on a page of this shape, since a keyboard tester is exactly what a keylogger would look like.',
    ],
  },

  ruler: {
    heading: 'Why an on-screen ruler has to be calibrated',
    paragraphs: [
      'A pixel is not a length. When CSS says an element is 96 pixels wide, that is a reference measurement defined against an assumed 96 pixels per inch, and almost no real display is 96 pixels per inch. A 24 inch 1080p monitor is about 92. A 27 inch 4K monitor is about 163. A modern phone is often above 400. Drawing a "one inch" line at 96 CSS pixels therefore produces a line that is one inch on nearly nothing.',
      'The browser cannot tell you the real number. It exposes the viewport in CSS pixels and a device pixel ratio, and neither carries the physical size of the panel. Screen dimensions in millimetres are not available to a web page, deliberately: the exact display geometry is a fingerprinting signal, and browsers have been closing those channels rather than opening them. So a page that claims to draw a real ruler without asking you anything is guessing, and the guess is wrong by up to 70 percent between common displays.',
      'The way out is to calibrate against an object whose size is fixed by international standard and which nearly everyone has. A bank card is exactly that. ISO/IEC 7810 ID-1 specifies 85.60 by 53.98 millimetres, and it governs every credit card, debit card and most national identity cards worldwide. You hold one against the screen, resize the outline until it matches, and that gives the one number the browser could not supply: how many pixels your display puts in a millimetre.',
      'From that single ratio everything else follows, and it is worth saving, because it is a property of the display rather than of the session. The calibration is stored on your device so the ruler is correct the next time you open it, and the value never leaves the browser, which matters given that it is precisely the kind of display fingerprint the platform declines to hand out.',
      'Two caveats, because they are the usual sources of error. Browser zoom changes the CSS pixel to physical pixel relationship, so a ruler calibrated at 100 percent zoom is wrong at 110 and you should recalibrate rather than compensate. And an external monitor is a different display: calibration follows the screen, not the computer.',
    ],
  },

  'camera-mic-test': {
    heading: 'The browser already knows why your camera is black',
    paragraphs: [
      'When a camera fails to start on a web page, the browser is not confused about the reason. The getUserMedia call rejects with a DOMException whose name is specified, and the name identifies the cause exactly. NotAllowedError means permission was refused, by you or by policy. NotFoundError means no device of that kind is attached. NotReadableError means the hardware is present and something else has it. OverconstrainedError means the device exists but cannot deliver the format that was asked for.',
      'Almost every webcam test page throws that away and shows a black rectangle. The information needed to fix the problem was returned by the platform and discarded by the page, which is why people end up reinstalling drivers to solve a conferencing app they left running in the background.',
      'That last case, NotReadableError, is the one worth knowing about, because it is both the most common and the least visible. On most systems a camera can be held by one application at a time. A video call that was closed with the window rather than quit, a recording tool minimised to the tray, or a background process that grabbed the device at login will hold it. Nothing on screen indicates this. The camera light may not even be on. The only symptom is that every other application reports a failure, and the reason is a program you believe you are not running.',
      'The microphone half has a different problem, which is that a still picture of a waveform proves nothing. The useful test is a level meter that moves with your voice, and the useful measurement is root mean square rather than peak: peak jumps on a single keystroke and reads as working, while RMS tracks sustained level, which is what tells you the microphone is genuinely picking up speech. A signal that registers but stays very low is a distinct diagnosis from silence, since one usually means input gain and the other usually means the wrong device is selected.',
      'It is also worth checking what the camera actually delivers rather than what was requested. A camera routinely ignores the resolution asked for and returns whatever it can, so the constraints tell you nothing; the track settings tell you the truth. That is the number to compare against a "1080p webcam" claim on a box. Nothing here is recorded: the stream is attached to a preview element and an audio analyser in the tab, and is discarded when you stop.',
    ],
  },

  'random-word': {
    heading: 'Randomness, bias, and why the size of the list is the whole answer',
    paragraphs: [
      'Most random word generators call Math.random. Browsers do not promise it is uniform, do not promise it is unpredictable, and are explicitly permitted to implement it with a fast generator whose output can be reconstructed from a handful of samples. For a party game that is fine. For anything you intend to use as a secret it is not, and the two uses sit on the same page in most tools without the difference being mentioned.',
      'Reaching for real cryptographic randomness is necessary and not sufficient, because the usual way of turning a random number into a list index reintroduces bias. Taking a 32-bit value modulo the list length is only uniform when the length divides 2^32 exactly, which for a list of 1,278 words it does not. The remainder means the first few hundred words come up very slightly more often than the rest, forever. The fix is rejection sampling: discard the values that fall in the incomplete final block and draw again. It costs an occasional extra draw, and it makes every word genuinely equally likely.',
      'That matters because the strength of a passphrase is arithmetic over the list, and the arithmetic is only true if the draw is fair. Each word contributes log2 of the list size in bits. Drawing from 1,278 words gives 10.32 bits per word, so eight words is 82.6 bits. Diceware, which draws from 7,776, gives 12.9 bits per word and reaches 77.5 bits in six. Eight words from a smaller curated list therefore beats six words from a larger one, which is the trade this list makes deliberately: every word is short, common and spellable from hearing, because a passphrase you cannot type is a passphrase you replace with something weak.',
      'Words are dealt rather than rolled. Each draw removes the word from the pool, so a list of twenty contains twenty different words and a game deals its whole deck before anything repeats. A passphrase cannot contain the same word twice either, which matters because repetition would make the real entropy lower than the number being displayed.',
      'One deliberate omission is worth explaining. Any draw here can be reproduced from a short code, so a class or a table of players can share one code and get identical words with no account and no server. The passphrase mode is structurally excluded from that: the function that generates it takes no seed parameter at all, so the sharing mechanism cannot reach it. A passphrase anyone holding a code can reproduce is not a secret, and the safest way to enforce that is to make it impossible to express rather than to remember not to do it.',
    ],
  },
};
