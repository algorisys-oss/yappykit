import { describe, it, expect } from 'vitest';
import {
  screenHeightFor,
  pieceCount,
  evenCuts,
  toPieces,
  rowNoise,
  snapCuts,
  pieceName,
} from './split';

/** Build RGBA for a synthetic capture: `busy` rows get alternating pixels. */
function capture(width: number, height: number, busy: readonly number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const y of busy) {
    for (let x = 0; x < width; x += 2) {
      const at = (y * width + x) * 4;
      data[at] = 0;
      data[at + 1] = 0;
      data[at + 2] = 0;
    }
  }
  return data;
}

describe('piece counts', () => {
  it('rounds up so no piece is taller than a screen', () => {
    // 1000 wide means a screen is 1778 tall; 4000 needs three pieces, not two.
    expect(screenHeightFor(1000)).toBe(1778);
    expect(pieceCount('screen', 4000, 1000, 0)).toBe(3);
  });

  it('takes the count the user asked for', () => {
    expect(pieceCount('pieces', 4000, 1000, 5)).toBe(5);
  });

  it('never returns zero pieces, whatever it is asked', () => {
    expect(pieceCount('pieces', 4000, 1000, 0)).toBe(1);
    expect(pieceCount('pieces', 4000, 1000, -3)).toBe(1);
    expect(pieceCount('screen', 10, 1000, 0)).toBe(1);
  });

  it('cannot ask for more pieces than there are rows', () => {
    expect(pieceCount('pieces', 6, 1000, 50)).toBe(6);
  });
});

describe('even cuts', () => {
  it('divides evenly rather than leaving a final sliver', () => {
    // Cutting 2010 every 1000 would end with a 10px strip. Three even pieces
    // are 670 each: all under the limit, none of them useless.
    const count = pieceCount('screen', 2010, 562, 0); // screen height 999
    expect(count).toBe(3);
    expect(toPieces(evenCuts('screen', 2010, 562, count), 2010).map((p) => p.h)).toEqual([
      670, 670, 670,
    ]);
  });

  it('keeps square tiles square, short last tile and all', () => {
    const pieces = toPieces(evenCuts('square', 2500, 1000, 3), 2500);
    expect(pieces).toEqual([
      { y: 0, h: 1000 },
      { y: 1000, h: 1000 },
      { y: 2000, h: 500 },
    ]);
  });

  it('covers the whole capture with no gap and no overlap', () => {
    const pieces = toPieces(evenCuts('pieces', 999, 300, 7), 999);
    expect(pieces).toHaveLength(7);
    expect(pieces[0]!.y).toBe(0);
    for (let i = 1; i < pieces.length; i += 1) {
      expect(pieces[i]!.y).toBe(pieces[i - 1]!.y + pieces[i - 1]!.h);
    }
    const last = pieces.at(-1)!;
    expect(last.y + last.h).toBe(999);
  });

  it('gives one whole piece when nothing is being split', () => {
    expect(evenCuts('pieces', 500, 300, 1)).toEqual([]);
    expect(toPieces([], 500)).toEqual([{ y: 0, h: 500 }]);
  });
});

describe('row noise', () => {
  it('scores a blank row zero and a row of text high', () => {
    const scores = rowNoise(capture(20, 3, [1]), 20, 3);
    expect(scores[0]).toBe(0);
    expect(scores[2]).toBe(0);
    expect(scores[1]).toBeGreaterThan(10);
  });

  it('ignores changes too small to be a glyph edge', () => {
    // A one-step gradient is compression noise, not an edge.
    const width = 10;
    const data = new Uint8ClampedArray(width * 4).fill(255);
    for (let x = 0; x < width; x += 1) data[x * 4] = 250 + (x % 2);
    expect(rowNoise(data, width, 1)[0]).toBe(0);
  });
});

describe('snapping cuts away from text', () => {
  it('moves a cut off a line of text and into the gap', () => {
    const height = 40;
    const scores = rowNoise(capture(20, height, [18, 19, 20, 21, 22]), 20, height);
    // An even split would land at 20, right through the text.
    expect(snapCuts([20], scores, 6)).toEqual([17]);
  });

  it('prefers the nearest of equally quiet rows', () => {
    const scores = new Uint32Array(40); // everything quiet
    scores[20] = 99;
    expect(snapCuts([20], scores, 6)).toEqual([19]);
  });

  it('leaves the cut alone when nothing nearby is quieter', () => {
    const scores = new Uint32Array(40).fill(50);
    expect(snapCuts([20], scores, 6)).toEqual([20]);
  });

  it('does not move a cut further than the radius allows', () => {
    const height = 60;
    const scores = new Uint32Array(height).fill(50);
    scores[40] = 0; // quiet, but well out of reach
    expect(snapCuts([20], scores, 6)).toEqual([20]);
  });

  it('keeps cuts in order and never collapses a piece', () => {
    const height = 100;
    const scores = new Uint32Array(height).fill(50);
    // One irresistibly quiet row that both cuts would want.
    scores[50] = 0;
    const snapped = snapCuts([48, 52], scores, 10);
    expect(snapped[0]).toBeLessThan(snapped[1]!);
    expect(snapped[1]! - snapped[0]!).toBeGreaterThanOrEqual(8);
    expect(toPieces(snapped, height).every((p) => p.h > 0)).toBe(true);
  });
});

describe('piece names', () => {
  it('pads so the pieces sort in a file manager', () => {
    expect(pieceName('chat.png', 1, 10, 'png')).toBe('chat-02.png');
    expect(pieceName('chat.png', 9, 10, 'png')).toBe('chat-10.png');
  });

  it('keeps a name that has no extension, and copes with none at all', () => {
    expect(pieceName('receipt', 0, 3, 'jpg')).toBe('receipt-1.jpg');
    expect(pieceName('', 0, 3, 'jpg')).toBe('screenshot-1.jpg');
  });
});
