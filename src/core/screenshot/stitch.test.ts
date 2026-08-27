import { describe, it, expect } from 'vitest';
import {
  planStitch,
  findOverlap,
  detectChrome,
  SIG_SAMPLES,
  CHROME_MAX_FRACTION,
  type Signature,
} from './stitch';

/**
 * The stitcher's fixtures are built the way the real input is made: one tall
 * virtual page, sliced into overlapping screenshots. A test can then assert the
 * exact thing that matters — that the plan reconstructs the page it was cut
 * from, at its original height, with nothing repeated and nothing lost.
 */

/** Deterministic noise. A fixture that varies per run cannot pin a threshold. */
function lcg(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 24;
  };
}

/** `rows` rows of textured content — a page with something written on it. */
function textured(rows: number, seed = 1): Uint8Array {
  const next = lcg(seed);
  const out = new Uint8Array(rows * SIG_SAMPLES);
  for (let i = 0; i < out.length; i++) out[i] = next();
  return out;
}

/** `rows` rows of one flat value — blank paper, or an empty chat background. */
function blank(rows: number, value = 250): Uint8Array {
  return new Uint8Array(rows * SIG_SAMPLES).fill(value);
}

function slice(page: Uint8Array, from: number, rows: number): Uint8Array {
  return page.slice(from * SIG_SAMPLES, (from + rows) * SIG_SAMPLES);
}

/** One screenshot: the given bands stacked top to bottom. */
function shot(...bands: Uint8Array[]): Signature {
  const rows = new Uint8Array(bands.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bands) {
    rows.set(b, at);
    at += b.length;
  }
  return { width: 1170, height: rows.length / SIG_SAMPLES, samples: SIG_SAMPLES, rows };
}

/** Every invariant a plan must satisfy whatever the input was. */
function assertWellFormed(plan: ReturnType<typeof planStitch>, sigs: Signature[]) {
  let dst = 0;
  for (const p of plan.pieces) {
    expect(p.srcH, 'a piece of no height should not be in the plan').toBeGreaterThan(0);
    expect(p.srcY).toBeGreaterThanOrEqual(0);
    expect(p.srcY + p.srcH).toBeLessThanOrEqual(sigs[p.index]!.height);
    expect(p.dstY, 'pieces must tile the output with no gap or overlap').toBe(dst);
    dst += p.srcH;
  }
  expect(plan.height).toBe(dst);
}

describe('planStitch', () => {
  it('rebuilds the page the screenshots were cut from', () => {
    // 900 rows of content, captured in three 400-row screenshots scrolled by
    // 250 each: the overlaps are 150 rows and the answer is 900 rows.
    const page = textured(900);
    const sigs = [0, 250, 500].map((y) => shot(slice(page, y, 400)));

    const plan = planStitch(sigs);

    expect(plan.height).toBe(900);
    expect(plan.seams.map((s) => s.overlapRows)).toEqual([150, 150]);
    expect(plan.seams.map((s) => s.kind)).toEqual(['matched', 'matched']);
    assertWellFormed(plan, sigs);
  });

  it('keeps the non-scrolling status and nav bars once, not once per screenshot', () => {
    // The chrome is byte-identical in every screenshot, which is what makes it
    // findable — and what makes a naive matcher believe the tops always align.
    const header = textured(40, 7);
    const footer = textured(24, 9);
    const page = textured(900, 3);
    const sigs = [0, 250, 500].map((y) => shot(header, slice(page, y, 400), footer));

    const plan = planStitch(sigs);

    expect(plan.chrome).toEqual({ headerRows: 40, footerRows: 24 });
    expect(plan.height).toBe(40 + 900 + 24);
    expect(plan.seams.map((s) => s.overlapRows)).toEqual([150, 150]);
    assertWellFormed(plan, sigs);

    // The chrome is drawn from the top of the first shot and the bottom of the
    // last one, and from nowhere else.
    expect(plan.pieces[0]).toMatchObject({ index: 0, srcY: 0 });
    expect(plan.pieces.at(-1)).toMatchObject({ index: 2, srcH: 24 });
  });

  it('will not call a featureless band chrome', () => {
    // A blank margin is identical across screenshots too. Cutting it as though
    // it were a status bar would silently swallow real scrolled height.
    const page = textured(600, 11);
    const sigs = [0, 200].map((y) => shot(blank(60), slice(page, y, 300)));

    expect(planStitch(sigs).chrome).toEqual({ headerRows: 0, footerRows: 0 });
  });

  it('joins end to end, and says so, when there is no seam to find', () => {
    // Scrolling through an empty region: nothing distinguishes one offset from
    // another, so inventing an overlap would be a guess presented as a fact.
    const sigs = [shot(blank(300, 250)), shot(blank(300, 250), textured(20, 5))];

    const plan = planStitch(sigs);

    expect(plan.seams[0]!.kind).toBe('joined');
    expect(plan.seams[0]!.overlapRows).toBe(0);
    expect(plan.height).toBe(620);
    assertWellFormed(plan, sigs);
  });

  it('drops a screenshot that repeats the one before it', () => {
    const only = shot(textured(400, 13));
    const plan = planStitch([only, { ...only }]);

    expect(plan.duplicates).toEqual([1]);
    expect(plan.seams[0]!.kind).toBe('duplicate');
    expect(plan.height).toBe(400);
    expect(plan.pieces.every((p) => p.index === 0)).toBe(true);
  });

  it('clamps a runaway chrome band rather than collapsing the whole capture', () => {
    // A sticky header taller than the cap. The cap is what stops two barely
    // scrolled screenshots from being declared all-chrome and merged to nothing.
    const header = textured(300, 17);
    const page = textured(700, 19);
    const sigs = [0, 150].map((y) => shot(header, slice(page, y, 400)));

    const plan = planStitch(sigs);

    expect(plan.chrome.headerRows).toBe(Math.floor(700 * CHROME_MAX_FRACTION));
    expect(plan.height).toBeGreaterThan(700);
    assertWellFormed(plan, sigs);
  });

  it('refuses screenshots of different widths', () => {
    const a = shot(textured(200, 21));
    expect(() => planStitch([a, { ...a, width: 828 }])).toThrow(/width/i);
  });

  it('passes a single screenshot through untouched', () => {
    const one = shot(textured(400, 23));
    const plan = planStitch([one]);
    expect(plan.height).toBe(400);
    expect(plan.seams).toEqual([]);
  });
});

describe('findOverlap', () => {
  it('prefers the larger overlap when repeated content matches at several offsets', () => {
    // A list of identical rows matches at every multiple of its period. The
    // larger overlap loses nothing; the smaller one repeats the list.
    const unit = textured(20, 29);
    const rows: Uint8Array[] = [];
    for (let i = 0; i < 10; i++) rows.push(unit);
    const a = shot(...rows);
    const b = shot(...rows);

    const found = findOverlap(a, b, 0, 0);
    expect(found.overlapRows).toBe(200);
  });

  it('reports a weak match as weak rather than as certain', () => {
    const page = textured(500, 31);
    const noisy = slice(page, 200, 300);
    // Perturb every sampled row enough to be visible but not enough to break
    // the match: a real screenshot pair differs by antialiasing and scrollbars.
    for (let i = 0; i < noisy.length; i += 7) noisy[i] = (noisy[i]! + 24) & 0xff;
    const found = findOverlap(shot(slice(page, 0, 300)), shot(noisy), 0, 0);

    expect(found.overlapRows).toBe(100);
    expect(found.kind).toBe('weak');
  });
});

describe('detectChrome', () => {
  it('takes the band every pair agrees on, not the largest one any pair saw', () => {
    const header = textured(40, 37);
    const page = textured(900, 41);
    // The middle pair happens to share 40 extra rows of content below the
    // chrome; the chrome is still only 40 rows.
    const sigs = [0, 250, 500].map((y) => shot(header, slice(page, y, 400)));

    expect(detectChrome(sigs).headerRows).toBe(40);
  });

  it('finds nothing to trim in a single screenshot', () => {
    expect(detectChrome([shot(textured(300, 43))])).toEqual({ headerRows: 0, footerRows: 0 });
  });
});

/**
 * A page that looks like an interface rather than like noise: 40 row cards, a
 * flat background, and one band of colour per card. Rows inside a card are
 * identical to each other, which is true of almost every real screenshot and
 * is what a naive "does this band have texture" check mistakes for emptiness.
 */
function cards(rows: number, seed = 71): Uint8Array {
  const out = new Uint8Array(rows * SIG_SAMPLES).fill(247);
  const next = lcg(seed);
  for (let card = 0; card * 40 < rows; card++) {
    const shade = card % 2 ? 232 : 255;
    const markerAt = next() % (SIG_SAMPLES - 5);
    const markerValue = next();
    for (let y = card * 40; y < Math.min(card * 40 + 36, rows); y++) {
      for (let s = 0; s < SIG_SAMPLES; s++) out[y * SIG_SAMPLES + s] = shade;
      // The card's own marker, present only on its middle rows.
      if (y >= card * 40 + 8 && y < card * 40 + 28) {
        for (let s = markerAt; s < markerAt + 5; s++) out[y * SIG_SAMPLES + s] = markerValue;
      }
    }
  }
  return out;
}

describe('planStitch on interface-shaped content', () => {
  it('finds the seam in a page of flat cards, not just in noise', () => {
    // The failure this pins: measured on a real 390x718 phone capture, every
    // one of four seams was reported as unmatched because the content between
    // the cards is flat, and the capture was stacked end to end at 3198 rows
    // instead of joined at 2318.
    const page = cards(1400);
    const sigs = [0, 400, 800].map((y) => shot(slice(page, y, 600)));

    const plan = planStitch(sigs);

    expect(plan.seams.map((s) => s.kind)).toEqual(['matched', 'matched']);
    expect(plan.seams.map((s) => s.overlapRows)).toEqual([200, 200]);
    expect(plan.height).toBe(1400);
    assertWellFormed(plan, sigs);
  });

  it('still refuses a band that is the same at every offset', () => {
    const sigs = [shot(blank(300, 250)), shot(blank(300, 250), textured(20, 5))];
    expect(planStitch(sigs).seams[0]!.kind).toBe('joined');
  });
});
