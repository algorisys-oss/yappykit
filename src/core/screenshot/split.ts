/**
 * Cut one very tall capture into pieces.
 *
 * The stitcher joins screenshots; this is the inverse, and the reason it exists
 * separately is that the two have different failure modes. Joining goes wrong
 * at the seams. Splitting goes wrong in the middle of a line of text: an even
 * split lands wherever arithmetic puts it, which is as likely to be halfway
 * down a row of characters as anywhere else, and half a sentence at the bottom
 * of one image and half at the top of the next is the thing that makes a split
 * capture look broken.
 *
 * So a cut is a suggestion. Each one is allowed to move by a small amount to
 * the quietest row nearby — a row of uniform colour, which in a screenshot is
 * the gap between paragraphs, the space above a message bubble, a table rule.
 * The pieces end up slightly uneven, which nobody notices, instead of slicing
 * through a word, which everybody does.
 */

/** How the height is divided. The user picks an outcome, not a pixel count. */
export type SplitMode = 'pieces' | 'screen' | 'square';

/** A piece of the capture, in source pixels. */
export interface Piece {
  y: number;
  h: number;
}

/** One screen's worth of a capture this wide, taken as a tall 16:9 phone. */
export function screenHeightFor(width: number): number {
  return Math.round((width * 16) / 9);
}

/**
 * How many pieces a mode asks for.
 *
 * `pieces` is the count the user typed. The other two derive it from a height,
 * and round up, so no piece is taller than the target rather than most of them.
 */
export function pieceCount(mode: SplitMode, height: number, width: number, wanted: number): number {
  if (mode === 'pieces') return Math.max(1, Math.min(Math.floor(wanted), height));
  const limit = mode === 'square' ? width : screenHeightFor(width);
  return Math.max(1, Math.ceil(height / Math.max(1, limit)));
}

/**
 * The cut positions before any snapping: interior boundaries only.
 *
 * `pieces` and `screen` divide the height evenly, because slicing at a fixed
 * height leaves a final sliver — a 2,010 pixel capture cut every 1,000 pixels
 * ends with a 10 pixel strip — and an even division of the same capture into
 * three gives 670 each, all under the limit and none of them useless.
 *
 * `square` cannot do that: equalising would stop the tiles being square, which
 * is the entire request. It cuts at exactly the width and lets the last tile be
 * short.
 */
export function evenCuts(mode: SplitMode, height: number, width: number, count: number): number[] {
  const cuts: number[] = [];
  if (mode === 'square') {
    for (let y = width; y < height; y += width) cuts.push(y);
    return cuts;
  }
  for (let i = 1; i < count; i += 1) cuts.push(Math.round((height * i) / count));
  return cuts;
}

/** Cuts to pieces. A cut at row `y` starts a new piece at `y`. */
export function toPieces(cuts: readonly number[], height: number): Piece[] {
  const bounds = [0, ...cuts, height];
  const out: Piece[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const y = bounds[i]!;
    const h = bounds[i + 1]! - y;
    if (h > 0) out.push({ y, h });
  }
  return out;
}

/**
 * How busy each row of pixels is: the count of places where the colour changes
 * along the row.
 *
 * A row crossing text changes colour at every character edge and scores high. A
 * row in the gap between two paragraphs scores zero. This is deliberately not
 * edge detection — it needs to run over tens of thousands of rows on a phone,
 * and counting transitions is one pass with no arithmetic per pixel beyond a
 * comparison.
 */
export function rowNoise(rgba: Uint8ClampedArray, width: number, height: number): Uint32Array {
  const scores = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    let changes = 0;
    for (let x = 1; x < width; x += 1) {
      const a = row + (x - 1) * 4;
      const b = row + x * 4;
      // Any channel moving by more than a hair counts once. JPEG noise and
      // subpixel antialiasing sit below this; a glyph edge does not.
      if (
        Math.abs(rgba[a]! - rgba[b]!) > 8 ||
        Math.abs(rgba[a + 1]! - rgba[b + 1]!) > 8 ||
        Math.abs(rgba[a + 2]! - rgba[b + 2]!) > 8
      ) {
        changes += 1;
      }
    }
    scores[y] = changes;
  }
  return scores;
}

/**
 * Move each cut to the quietest row within `radius`, nearest wins on a tie.
 *
 * A cut only moves to somewhere strictly quieter than where it already is, so a
 * capture with no quiet rows at all — a photograph, a gradient — keeps its even
 * division instead of being nudged around by noise. Cuts stay in order and no
 * piece is allowed to collapse.
 */
export function snapCuts(
  cuts: readonly number[],
  scores: Uint32Array,
  radius: number,
  minPiece = 8,
): number[] {
  const height = scores.length;
  const out: number[] = [];
  let floor = minPiece;
  for (const [i, cut] of cuts.entries()) {
    const ceiling = (cuts[i + 1] ?? height) - minPiece;
    const from = Math.max(floor, cut - radius);
    const to = Math.min(ceiling, cut + radius);
    let best = Math.max(floor, Math.min(cut, ceiling));
    let bestScore = scores[best] ?? 0;
    for (let y = from; y <= to; y += 1) {
      const score = scores[y]!;
      // Strictly quieter, or equally quiet and closer to where the cut wanted
      // to be. Without the distance rule a run of identical blank rows would
      // always snap to its first row and drag the cut further than it needs.
      if (score < bestScore || (score === bestScore && Math.abs(y - cut) < Math.abs(best - cut))) {
        best = y;
        bestScore = score;
      }
    }
    out.push(best);
    floor = best + minPiece;
  }
  return out;
}

/** `chat.png` piece 2 of 10 becomes `chat-02.png`, so the pieces sort. */
export function pieceName(name: string, index: number, total: number, extension: string): string {
  const stem = name.replace(/\.[^.]+$/, '') || 'screenshot';
  const width = String(total).length;
  return `${stem}-${String(index + 1).padStart(width, '0')}.${extension}`;
}
