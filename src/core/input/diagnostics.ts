/**
 * Input-device diagnostics.
 *
 * These are the measurements that turn a "watch it light up" page into
 * something that answers the question people actually arrived with: is this
 * mouse broken, and can I prove it to a warranty desk?
 *
 * Everything here is pure so it can be tested without a device.
 */

/**
 * Below this, two presses of the same button cannot both be deliberate: the
 * fastest sustained human double-click is around 80–120 ms, and even a hurried
 * one does not go under ~60 ms. A worn switch bounces in single-digit
 * milliseconds.
 */
export const CHATTER_MS = 25;
/** Between these, it is too fast to be comfortable but not provably a fault. */
export const SUSPECT_MS = 60;

export type ClickHealth = 'untested' | 'ok' | 'suspect' | 'faulty';

export interface ChatterReport {
  health: ClickHealth;
  /** Presses that arrived impossibly soon after the previous one. */
  chatterEvents: number;
  /** Presses in the ambiguous band. */
  suspectEvents: number;
  shortestGapMs: number | null;
}

/** Classify a button from the gaps between consecutive presses of it. */
export function analyseChatter(gapsMs: readonly number[]): ChatterReport {
  const gaps = gapsMs.filter((g) => Number.isFinite(g) && g >= 0);
  if (gaps.length === 0) {
    return { health: 'untested', chatterEvents: 0, suspectEvents: 0, shortestGapMs: null };
  }
  const chatterEvents = gaps.filter((g) => g < CHATTER_MS).length;
  const suspectEvents = gaps.filter((g) => g >= CHATTER_MS && g < SUSPECT_MS).length;
  const shortestGapMs = Math.min(...gaps);
  const health: ClickHealth = chatterEvents > 0 ? 'faulty' : suspectEvents > 0 ? 'suspect' : 'ok';
  return { health, chatterEvents, suspectEvents, shortestGapMs };
}

/** Common USB/wireless polling rates, in Hz. */
export const STANDARD_RATES = [125, 250, 500, 1000] as const;

export interface PollingReport {
  /** Raw estimate from the median interval, or null if too few samples. */
  hz: number | null;
  /** The standard rate the estimate is closest to, when it is close enough. */
  nearest: number | null;
  samples: number;
}

/**
 * Estimate polling rate from pointer-event timestamps.
 *
 * The MEDIAN interval is used, not the mean: a single dropped frame or a
 * garbage-collection pause produces one huge interval that would drag a mean
 * far off, while the median ignores it. Browsers also coalesce pointer events,
 * so this is a floor on the device's true rate — never an overstatement.
 */
export function analysePolling(timestampsMs: readonly number[], minSamples = 20): PollingReport {
  const ts = [...timestampsMs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i]! - ts[i - 1]!;
    if (d > 0) gaps.push(d);
  }
  if (gaps.length < minSamples) return { hz: null, nearest: null, samples: gaps.length };

  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
  if (median <= 0) return { hz: null, nearest: null, samples: gaps.length };

  const hz = 1000 / median;
  // Snap only when genuinely close; otherwise report the raw figure and let the
  // reader draw their own conclusion rather than inventing precision.
  let nearest: number | null = null;
  let best = Infinity;
  for (const r of STANDARD_RATES) {
    const err = Math.abs(hz - r) / r;
    if (err < best) {
      best = err;
      nearest = r;
    }
  }
  return { hz, nearest: best <= 0.25 ? nearest : null, samples: gaps.length };
}

/** How a keyboard's simultaneous-key limit is normally described. */
export function rolloverClass(maxSimultaneous: number): string {
  if (maxSimultaneous <= 0) return '-';
  if (maxSimultaneous >= 10) return 'NKRO';
  return `${maxSimultaneous}KRO`;
}
