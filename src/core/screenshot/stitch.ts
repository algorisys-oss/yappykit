/**
 * Finding the seams between overlapping screenshots.
 *
 * A scroll capture is not a set of independent pictures: it is one tall page,
 * photographed in overlapping pieces, with a strip of the phone's own interface
 * printed on every piece. Reassembling it means answering two questions per
 * pair — how far the page scrolled between them, and which rows never scrolled
 * at all — and getting the second one wrong is what makes most stitchers repeat
 * a status bar down the middle of the result.
 *
 * Everything here works on ROW SIGNATURES rather than pixels: each image is
 * reduced to `SIG_SAMPLES` luma samples per row by ../screenshot/compose, which
 * is a few hundred kilobytes for a capture that would be tens of megabytes as
 * bitmaps. That is what keeps the search affordable on a phone, and it is why
 * this module is pure: no canvas, no DOM, no ImageBitmap. It plans; the caller
 * paints.
 */

/** Luma samples kept per row. Enough to tell text apart, small enough to scan. */
export const SIG_SAMPLES = 32;

/** Rows this similar (mean absolute difference, 0-255) count as unchanged. */
const CHROME_EPS = 3;

/**
 * The most of a screenshot that may be declared fixed interface, top or bottom.
 *
 * Two screenshots taken a small scroll apart are identical over most of their
 * height, and without a ceiling the detector reads that as "almost all of this
 * is a status bar" and merges the capture down to nothing. Real chrome is a
 * bar, not a page.
 */
export const CHROME_MAX_FRACTION = 0.25;

/** A band flatter than this is not a bar of interface: see `bandDetail`. */
const DETAIL_MIN = 2;

/**
 * How much better the winning alignment must be than a near miss.
 *
 * This is the guard against confident nonsense, and it replaced an absolute
 * "does this band have texture" floor that failed on real input: a screenshot
 * of an interface is mostly flat, so a page of cards and chat bubbles scored as
 * featureless and every seam in a real capture was refused.
 *
 * The question that actually matters is not whether a band has detail but
 * whether it could just as well have been aligned somewhere else. An empty
 * margin matches itself perfectly at EVERY offset, so its best score and its
 * near misses are the same number, and the match carries no information
 * whatever it scores. Content that is flat but structured, which is what a real
 * screenshot looks like, comes apart as soon as it is nudged.
 */
const AMBIGUITY_MARGIN = 2;

/** Nudges used to see whether a winning alignment is actually distinguishable. */
const RIVAL_OFFSETS = [-13, -5, 5, 13];

/** Fewer rows than this in common is not a seam, it is a coincidence. */
const MIN_OVERLAP = 16;

/** Mean absolute difference below this is a match; above `MATCH_MAX`, not one. */
const MATCH_STRONG = 4;
const MATCH_MAX = 10;

/** Ties inside this margin are settled by preferring the larger overlap. */
const SCORE_EPS = 0.5;

/**
 * Rows sampled to score one candidate overlap, and to rescore the finalists.
 *
 * Sampling is what makes the search affordable: a candidate costs the same
 * whether it claims an overlap of 20 rows or 2,000, so scanning every possible
 * offset of a 2,500-row screenshot is a few million byte comparisons rather
 * than a few billion. Every offset IS scanned — striding the search and
 * interpolating does not work here, because a signature misaligned by two rows
 * scores like unrelated content rather than like a near miss. There is no slope
 * to follow towards the answer, only the answer.
 */
const COARSE_ROWS = 64;
const FINE_ROWS = 192;
/** How many of the cheapest candidates get a dense second look. */
const FINALISTS = 8;

/** One image, reduced to `height` rows of `samples` luma values. */
export interface Signature {
  /** Width in real pixels — carried so the plan can size the output canvas. */
  width: number;
  /** Height in real pixels, which is also the number of signature rows. */
  height: number;
  samples: number;
  rows: Uint8Array;
}

export type SeamKind =
  /** A confident overlap. */
  | 'matched'
  /** An overlap that fits, but not cleanly. Worth telling the user about. */
  | 'weak'
  /** No overlap could be found, so the two are butted end to end. */
  | 'joined'
  /** The second screenshot repeats the first and contributes nothing. */
  | 'duplicate';

export interface Seam {
  /** Index of the screenshot joined onto the one before it. */
  index: number;
  overlapRows: number;
  /** Mean absolute difference across the matched band, 0-255. Lower is better. */
  score: number;
  kind: SeamKind;
}

/** A run of rows copied from one source image to the output. */
export interface Piece {
  index: number;
  srcY: number;
  srcH: number;
  dstY: number;
}

export interface StitchPlan {
  width: number;
  height: number;
  /** In output order, tiling the result with no gap and no overlap. */
  pieces: Piece[];
  /** Rows of never-scrolling interface, drawn once each. */
  chrome: { headerRows: number; footerRows: number };
  seams: Seam[];
  /** Screenshots left out because they repeated the previous one. */
  duplicates: number[];
}

/** Mean absolute difference between row `ai` of `a` and row `bi` of `b`. */
function rowDiff(a: Signature, ai: number, b: Signature, bi: number): number {
  const n = a.samples;
  const ao = ai * n;
  const bo = bi * n;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.abs(a.rows[ao + k]! - b.rows[bo + k]!);
  return sum / n;
}

/** How many rows to sample from a band of `h`, and the gap between them. */
function sampleCount(h: number, max: number): number {
  return Math.min(h, max);
}

/**
 * How much vertical texture a band carries.
 *
 * Used only to decide whether a band of unchanging rows is a BAR. A status bar
 * has a clock and icons in it; a blank margin at the top of a page is equally
 * unchanging and is not interface, and trimming it would quietly eat scrolled
 * height. This is deliberately not used to judge a seam: an interface is mostly
 * flat, so as a test of whether real content is present it says no far too
 * often. That question is answered by AMBIGUITY_MARGIN instead.
 */
function bandDetail(sig: Signature, start: number, h: number): number {
  const count = sampleCount(h, COARSE_ROWS);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const row = start + Math.floor((i * h) / count);
    // Stay inside the band: comparing its last row against the first row below
    // it measures the edge of the band, not the texture within it.
    if (row + 1 >= start + h) continue;
    sum += rowDiff(sig, row, sig, row + 1);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** How well `a`'s last `h` body rows line up with `b`'s first `h` body rows. */
function scoreOverlap(
  a: Signature,
  b: Signature,
  h: number,
  headerRows: number,
  footerRows: number,
  maxRows: number,
): number {
  const aStart = a.height - footerRows - h;
  const bStart = headerRows;
  const count = sampleCount(h, maxRows);
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const k = Math.floor((i * h) / count);
    sum += rowDiff(a, aStart + k, b, bStart + k);
  }
  return sum / count;
}

export interface OverlapResult {
  overlapRows: number;
  score: number;
  kind: SeamKind;
}

/**
 * The scroll distance between two consecutive screenshots, as an overlap.
 *
 * Two passes: every candidate offset is scored on 64 evenly spaced rows, then
 * the cheapest handful are rescored on 192. The second pass exists because a
 * thin sample can be lucky — 64 rows of a wrong offset occasionally agree by
 * chance, and 192 rows of it do not.
 *
 * Ties go to the LARGER overlap. Repeating content — a list of messages, a
 * table of rows — genuinely matches at every multiple of its period, and of the
 * two ways to be wrong, dropping content the user can see they are missing is
 * better than silently printing it twice.
 */
export function findOverlap(
  a: Signature,
  b: Signature,
  headerRows: number,
  footerRows: number,
): OverlapResult {
  const bodyA = a.height - headerRows - footerRows;
  const bodyB = b.height - headerRows - footerRows;
  const max = Math.min(bodyA, bodyB);
  const none: OverlapResult = { overlapRows: 0, score: Number.POSITIVE_INFINITY, kind: 'joined' };
  if (max < MIN_OVERLAP) return none;

  const better = (h: number, s: number, bestH: number, bestS: number) =>
    s < bestS - SCORE_EPS || (Math.abs(s - bestS) <= SCORE_EPS && h > bestH);

  const coarse: { h: number; score: number }[] = [];
  for (let h = MIN_OVERLAP; h <= max; h++) {
    coarse.push({ h, score: scoreOverlap(a, b, h, headerRows, footerRows, COARSE_ROWS) });
  }
  coarse.sort((x, y) => x.score - y.score || y.h - x.h);

  let bestH = 0;
  let bestS = Number.POSITIVE_INFINITY;
  for (const candidate of coarse.slice(0, FINALISTS)) {
    const s = scoreOverlap(a, b, candidate.h, headerRows, footerRows, FINE_ROWS);
    if (better(candidate.h, s, bestH, bestS)) {
      bestH = candidate.h;
      bestS = s;
    }
  }

  if (bestS > MATCH_MAX) return none;

  // Would a slightly different alignment have done just as well? If so, this
  // one is a coincidence rather than a reading.
  let rival = Number.POSITIVE_INFINITY;
  for (const offset of RIVAL_OFFSETS) {
    const h = bestH + offset;
    if (h < MIN_OVERLAP || h > max) continue;
    rival = Math.min(rival, scoreOverlap(a, b, h, headerRows, footerRows, FINE_ROWS));
  }
  if (rival !== Number.POSITIVE_INFINITY && bestS + AMBIGUITY_MARGIN >= rival) return none;

  return { overlapRows: bestH, score: bestS, kind: bestS <= MATCH_STRONG ? 'matched' : 'weak' };
}

/** Leading rows that are unchanged between two screenshots. */
function leadingMatch(a: Signature, b: Signature): number {
  const limit = Math.min(a.height, b.height);
  let n = 0;
  while (n < limit && rowDiff(a, n, b, n) <= CHROME_EPS) n++;
  return n;
}

/** Trailing rows that are unchanged between two screenshots. */
function trailingMatch(a: Signature, b: Signature): number {
  const limit = Math.min(a.height, b.height);
  let n = 0;
  while (n < limit && rowDiff(a, a.height - 1 - n, b, b.height - 1 - n) <= CHROME_EPS) n++;
  return n;
}

/**
 * The bands of interface that never scroll: status bar, toolbar, tab bar.
 *
 * Taken as the MINIMUM across every consecutive pair, because that is the only
 * part every screenshot agrees on. One pair sharing extra rows means the page
 * happened to repeat something there, not that the bar is taller.
 */
export function detectChrome(sigs: readonly Signature[]): {
  headerRows: number;
  footerRows: number;
} {
  if (sigs.length < 2) return { headerRows: 0, footerRows: 0 };

  let header = Number.POSITIVE_INFINITY;
  let footer = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sigs.length; i++) {
    header = Math.min(header, leadingMatch(sigs[i - 1]!, sigs[i]!));
    footer = Math.min(footer, trailingMatch(sigs[i - 1]!, sigs[i]!));
  }

  const cap = Math.floor(Math.min(...sigs.map((s) => s.height)) * CHROME_MAX_FRACTION);
  header = Math.min(header, cap);
  footer = Math.min(footer, cap);

  const first = sigs[0]!;
  // A flat band is identical across screenshots whether or not it is chrome.
  // Trimming it would eat scrolled height that nothing says was repeated.
  if (bandDetail(first, 0, header) < DETAIL_MIN) header = 0;
  if (bandDetail(first, first.height - footer, footer) < DETAIL_MIN) footer = 0;

  return { headerRows: header, footerRows: footer };
}

/**
 * Where every row of the output comes from.
 *
 * The fixed chrome is taken from the top of the first screenshot and the bottom
 * of the last one; everything between is body, contributed by each screenshot
 * from the end of its overlap with the previous one.
 */
export function planStitch(sigs: readonly Signature[]): StitchPlan {
  if (sigs.length === 0) throw new Error('There is nothing to stitch.');
  const width = sigs[0]!.width;
  if (sigs.some((s) => s.width !== width)) {
    throw new Error('Every screenshot must be the same width.');
  }

  const chrome = detectChrome(sigs);
  const { headerRows, footerRows } = chrome;
  const pieces: Piece[] = [];
  const seams: Seam[] = [];
  const duplicates: number[] = [];

  const first = sigs[0]!;
  let dst = first.height - footerRows;
  pieces.push({ index: 0, srcY: 0, srcH: dst, dstY: 0 });

  let prev = 0;
  for (let i = 1; i < sigs.length; i++) {
    const sig = sigs[i]!;
    const found = findOverlap(sigs[prev]!, sig, headerRows, footerRows);
    const srcY = headerRows + found.overlapRows;
    const srcH = sig.height - footerRows - srcY;
    if (srcH <= 0) {
      // Nothing new below the overlap: this screenshot IS the previous one.
      duplicates.push(i);
      seams.push({ index: i, overlapRows: found.overlapRows, score: found.score, kind: 'duplicate' });
      continue;
    }
    seams.push({ index: i, overlapRows: found.overlapRows, score: found.score, kind: found.kind });
    pieces.push({ index: i, srcY, srcH, dstY: dst });
    dst += srcH;
    prev = i;
  }

  if (footerRows > 0) {
    const tail = sigs[prev]!;
    pieces.push({ index: prev, srcY: tail.height - footerRows, srcH: footerRows, dstY: dst });
    dst += footerRows;
  }

  return { width, height: dst, pieces, chrome, seams, duplicates };
}
