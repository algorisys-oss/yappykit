/**
 * Matching a font's measured characteristics to a way it feels.
 *
 * This module is where measurement stops and judgement starts, and the split is
 * deliberately visible. Reading that a font is a high-contrast serif with a
 * small x-height is computation, and lives in ./metrics. Deciding that this
 * combination is what people mean by "elegant" is an opinion, and lives here,
 * written down as a table so that a reader can disagree with the reasoning
 * rather than only with the answer. Every result carries the traits it matched
 * and the traits it missed, so the interface can show its working.
 *
 * The rule that keeps it honest is that an untestable trait is not a failed
 * trait. A font predating OS/2 version 2 has no recorded x-height, and scoring
 * that as a miss would rank it on its age rather than on how it looks. Score is
 * matched over APPLICABLE, and a font with nothing applicable gets no score at
 * all instead of a zero. It is the same reasoning as the capability gate: say
 * what you do not know, rather than defaulting it to a number.
 */
import type { FontMetrics } from './metrics';
import type { FontEntry } from './index';

export type FeelId = 'elegant' | 'authoritative' | 'friendly' | 'technical' | 'loud' | 'quiet';

export type TraitId = 'category' | 'weight' | 'width' | 'xheight' | 'contrast' | 'slant';

/** Broad shape of the letterforms, which is the strongest single signal. */
export type Category = 'serif' | 'slab' | 'sans' | 'mono' | 'script' | 'display' | 'unknown';

export type Contrast = 'low' | 'medium' | 'high' | 'unknown';

export function categoryOf(m: FontMetrics): Category {
  // A monospace serif is monospace for our purposes: the even rhythm is what
  // reads, not the serifs.
  if (m.fixedPitch === true) return 'mono';
  if (m.panose?.proportion === 9) return 'mono';

  switch (m.familyClass) {
    case 1:
    case 2:
    case 3:
    case 7:
      return 'serif';
    case 4:
    case 5:
      return 'slab';
    case 8:
      return 'sans';
    case 9:
      return 'display';
    case 10:
      return 'script';
    case 12:
      return 'display';
    default:
      break;
  }

  const panose = m.panose;
  if (panose) {
    if (panose.familyType === 3) return 'script';
    if (panose.familyType === 4 || panose.familyType === 5) return 'display';
    if (panose.familyType === 2 && panose.serifStyle !== null) {
      // 11 to 13 are the sans styles: normal, obtuse and perpendicular.
      return panose.serifStyle >= 11 && panose.serifStyle <= 13 ? 'sans' : 'serif';
    }
  }
  return 'unknown';
}

export function contrastOf(m: FontMetrics): Contrast {
  const recorded = m.panose?.contrast;
  if (recorded != null) {
    if (recorded <= 4) return 'low';
    if (recorded <= 6) return 'medium';
    return 'high';
  }
  // Only the classes where contrast is part of the definition. A sans is
  // usually low contrast, but usually is not a measurement, and guessing here
  // would quietly turn most of the library into confident answers.
  if (m.familyClass === 3) return 'high';
  if (m.familyClass === 4) return 'medium';
  if (m.familyClass === 5) return 'low';
  return 'unknown';
}

/** A single test. Null means the font did not record what this asks about. */
interface Trait {
  id: TraitId;
  test(m: FontMetrics): boolean | null;
}

const category = (...allowed: Category[]): Trait => ({
  id: 'category',
  test: (m) => {
    const found = categoryOf(m);
    return found === 'unknown' ? null : allowed.includes(found);
  },
});

const contrast = (...allowed: Contrast[]): Trait => ({
  id: 'contrast',
  test: (m) => {
    const found = contrastOf(m);
    return found === 'unknown' ? null : allowed.includes(found);
  },
});

const weight = (lo: number, hi: number): Trait => ({
  id: 'weight',
  test: (m) => (m.weightClass === null ? null : m.weightClass >= lo && m.weightClass <= hi),
});

const width = (lo: number, hi: number): Trait => ({
  id: 'width',
  test: (m) => (m.widthClass === null ? null : m.widthClass >= lo && m.widthClass <= hi),
});

const xheight = (lo: number, hi: number): Trait => ({
  id: 'xheight',
  test: (m) => (m.xHeightRatio === null ? null : m.xHeightRatio >= lo && m.xHeightRatio <= hi),
});

const upright: Trait = {
  id: 'slant',
  test: (m) => (m.italicAngle === null ? null : Math.abs(m.italicAngle) < 1),
};

/**
 * The rubric. Each feel is a handful of traits, and a font is scored on the
 * ones its own metrics can answer.
 *
 * Kept to characteristics with a physical anchor, which is partly a translation
 * decision: heavy and condensed mean the same thing in every language this
 * ships in, and trustworthy does not.
 */
export const FEELS: Record<FeelId, Trait[]> = {
  elegant: [category('serif'), weight(300, 500), xheight(0, 0.7), contrast('high')],
  authoritative: [
    category('serif', 'slab'),
    weight(400, 600),
    xheight(0.68, 0.76),
    contrast('low', 'medium'),
  ],
  friendly: [
    category('sans'),
    weight(350, 550),
    xheight(0.72, 1),
    width(5, 6),
    contrast('low'),
  ],
  technical: [category('mono', 'sans'), width(4, 6), contrast('low'), upright],
  loud: [weight(700, 1000), width(5, 9), xheight(0.7, 1)],
  quiet: [category('sans', 'serif'), weight(300, 400), width(5, 5), contrast('low', 'medium')],
};

export const FEEL_IDS = Object.keys(FEELS) as FeelId[];

export interface FeelScore {
  feel: FeelId;
  matched: TraitId[];
  missed: TraitId[];
  /** Traits this font did not record, and so was not judged on. */
  unknown: TraitId[];
  /** matched + missed. Evidence count, and the tiebreak. */
  applicable: number;
  /** matched over applicable, or null when nothing could be tested. */
  score: number | null;
}

export function scoreFeel(m: FontMetrics, feel: FeelId): FeelScore {
  const matched: TraitId[] = [];
  const missed: TraitId[] = [];
  const unknown: TraitId[] = [];

  for (const trait of FEELS[feel]) {
    const result = trait.test(m);
    if (result === null) unknown.push(trait.id);
    else if (result) matched.push(trait.id);
    else missed.push(trait.id);
  }

  const applicable = matched.length + missed.length;
  return {
    feel,
    matched,
    missed,
    unknown,
    applicable,
    score: applicable === 0 ? null : matched.length / applicable,
  };
}

export interface StyleMatch {
  font: FontEntry;
  score: FeelScore;
}

export interface StyleReport {
  /** Matched everything askable, on more than a single trait. */
  strong: StyleMatch[];
  /** Matched most of it, or matched everything on thin evidence. */
  partial: StyleMatch[];
  /** Counted rather than listed: nobody scrolls three hundred rejections. */
  weak: number;
  /** Recorded too little about itself to be judged at all. */
  unclassified: StyleMatch[];
}

/**
 * Two traits is the floor for a confident answer. A font that matched one
 * trait out of one scores 1.0 on the arithmetic and has told us almost nothing,
 * so it belongs with the near misses rather than above a font that matched four
 * out of four.
 */
const MIN_EVIDENCE = 2;
const PARTIAL_FLOOR = 0.5;

export function rankByFeel(fonts: FontEntry[], feel: FeelId): StyleReport {
  const strong: StyleMatch[] = [];
  const partial: StyleMatch[] = [];
  const unclassified: StyleMatch[] = [];
  let weak = 0;

  for (const font of fonts) {
    if (!font.metrics) {
      unclassified.push({ font, score: scoreFeel(EMPTY_METRICS, feel) });
      continue;
    }
    const score = scoreFeel(font.metrics, feel);
    const match = { font, score };

    if (score.score === null) unclassified.push(match);
    else if (score.score === 1 && score.applicable >= MIN_EVIDENCE) strong.push(match);
    else if (score.score >= PARTIAL_FLOOR) partial.push(match);
    else weak++;
  }

  strong.sort(compare);
  partial.sort(compare);
  unclassified.sort((a, b) => byName.compare(a.font.family, b.font.family));
  return { strong, partial, weak, unclassified };
}

const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Best score first, then the font that answered more traits, then by name. */
function compare(a: StyleMatch, b: StyleMatch): number {
  return (
    (b.score.score ?? 0) - (a.score.score ?? 0) ||
    b.score.applicable - a.score.applicable ||
    byName.compare(a.font.family, b.font.family)
  );
}

const EMPTY_METRICS: FontMetrics = {
  weightClass: null,
  widthClass: null,
  familyClass: null,
  familySubclass: null,
  xHeightRatio: null,
  italicAngle: null,
  fixedPitch: null,
  unitsPerEm: null,
  lineHeightRatio: null,
  panose: null,
};
