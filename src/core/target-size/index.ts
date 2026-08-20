/**
 * Target-size engine ★
 *
 * The most reused and most differentiating module in the codebase. It is
 * codec-agnostic on purpose: it knows nothing about JPEG, WebP, ffmpeg or
 * pixels. It is handed an `encode(params)` function and a byte budget, and it
 * searches the parameter space for the LARGEST output that still fits.
 *
 * This is what powers the outcome-driven promise: the user says "under 100 KB"
 * and the engine solves for the quality/scale the user would otherwise have to
 * guess.
 *
 * Two strategies:
 *   - 'binary'            — images: binary-search quality, then dimensions.
 *   - 'analytic-then-verify' — video: compute bitrate analytically, verify with
 *                              a single corrective re-encode (a full search is
 *                              far too slow for video).
 */

export interface EncodeParams {
  /** 0..1, higher = better quality / larger output. */
  quality: number;
  /** 0..1 scale factor applied to source dimensions. 1 = original size. */
  scale: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface TargetSizeOptions {
  /** Codec bridge. Must be pure w.r.t. its params and honour `signal`. */
  encode: (params: EncodeParams, signal: AbortSignal) => Promise<Uint8Array>;
  /** Hard byte budget the output must fit under (e.g. 100 * 1024). */
  budgetBytes: number;
  searchSpace: {
    quality: Range;
    /** Optional. When omitted, the engine never rescales (scale stays at max). */
    scale?: Range;
  };
  strategy: 'binary' | 'analytic-then-verify';
  signal?: AbortSignal;
  /** Max encode attempts before returning the best fit found. Default 12. */
  maxIterations?: number;
  /**
   * For 'analytic-then-verify': map a target byte budget to encode params.
   * Required for that strategy (video computes bitrate from duration/budget).
   */
  analyticGuess?: (budgetBytes: number) => EncodeParams;
}

export interface TargetSizeResult {
  /** The largest output that fits under budget, or the smallest we could make. */
  output: Uint8Array;
  bytes: number;
  params: EncodeParams;
  /** True when `bytes <= budgetBytes`. */
  withinBudget: boolean;
  /** What the engine had to sacrifice to fit, for honest UI ("scaled to 78%"). */
  sacrifice: {
    qualityReduced: boolean;
    scaled: boolean;
  };
  iterations: number;
}

const DEFAULT_MAX_ITER = 12;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * Encode → measure → adjust → repeat until under budget.
 * Returns the best output found within the iteration budget.
 */
export async function targetSize(opts: TargetSizeOptions): Promise<TargetSizeResult> {
  if (opts.budgetBytes <= 0) {
    throw new RangeError('budgetBytes must be positive');
  }
  const maxIter = opts.maxIterations ?? DEFAULT_MAX_ITER;
  const signal = opts.signal;

  return opts.strategy === 'analytic-then-verify'
    ? analyticThenVerify(opts, maxIter, signal)
    : binarySearch(opts, maxIter, signal);
}

/**
 * Images: binary-search quality first. If the best quality still overshoots,
 * drop dimensions (also by binary search) and retry. Keeps the best fitting
 * candidate seen so far, so we never return something worse than we found.
 */
async function binarySearch(
  opts: TargetSizeOptions,
  maxIter: number,
  signal: AbortSignal | undefined,
): Promise<TargetSizeResult> {
  const { encode, budgetBytes, searchSpace } = opts;
  const qRange = { ...searchSpace.quality };
  const scaleMax = searchSpace.scale?.max ?? 1;
  const scaleMin = searchSpace.scale?.min ?? scaleMax;
  const canScale = searchSpace.scale != null && scaleMin < scaleMax;

  let iterations = 0;
  let scale = scaleMax;
  let best: TargetSizeResult | null = null;

  const candidateFrom = (output: Uint8Array, params: EncodeParams): TargetSizeResult => ({
    output,
    bytes: output.byteLength,
    params,
    withinBudget: output.byteLength <= budgetBytes,
    sacrifice: {
      qualityReduced: params.quality < searchSpace.quality.max,
      scaled: params.scale < scaleMax,
    },
    iterations,
  });

  // Encode one quality point at the current scale. Pure w.r.t. `best`: the
  // caller folds the result in, so TS can prove `best` is assigned in-body.
  const probe = async (quality: number): Promise<TargetSizeResult> => {
    throwIfAborted(signal);
    const params: EncodeParams = { quality, scale };
    const output = await encode(params, signal ?? new AbortController().signal);
    iterations += 1;
    return candidateFrom(output, params);
  };

  // Outer loop over scale levels (usually runs once at scale = max). Output size
  // is monotonic in quality, so at each scale we probe the boundaries first —
  // otherwise a fit that lives exactly at qMin is never encoded (interior
  // midpoints alone can miss it).
  for (;;) {
    // Cheapest possible output at this scale. If even this overshoots, quality
    // can't save us here — only scaling down can.
    const low = await probe(qRange.min);
    best = pickBest(best, low);
    if (low.withinBudget) {
      // Best possible output at this scale. If it already fits, we're done.
      let high = low;
      if (iterations < maxIter) {
        high = await probe(qRange.max);
        best = pickBest(best, high);
      }
      if (!high.withinBudget) {
        // Fit lies between qMin (fits) and qMax (doesn't). Search for the largest
        // fitting quality; `best` accumulates every fitting probe.
        let lo = qRange.min;
        let hi = qRange.max;
        while (iterations < maxIter && hi - lo > 0.01) {
          const quality = (lo + hi) / 2;
          const candidate = await probe(quality);
          best = pickBest(best, candidate);
          if (candidate.withinBudget) lo = quality;
          else hi = quality;
        }
      }
      break; // a fitting output exists at this scale — stop.
    }

    if (!canScale || iterations >= maxIter) break;

    // qMin overshoots and we can rescale: step dimensions down and retry.
    const nextScale = (scale + scaleMin) / 2;
    if (scale - nextScale < 0.02) break;
    scale = nextScale;
  }

  // `best` is always set: the for(;;) body assigns it before any break.
  return { ...best, iterations };
}

/**
 * Prefer a fitting candidate; among fitting ones the largest (best quality);
 * among non-fitting ones the smallest (closest to fitting). Pure — no capture.
 */
function pickBest(
  current: TargetSizeResult | null,
  candidate: TargetSizeResult,
): TargetSizeResult {
  if (current === null) return candidate;
  if (candidate.withinBudget && !current.withinBudget) return candidate;
  if (candidate.withinBudget && current.withinBudget && candidate.bytes > current.bytes) {
    return candidate;
  }
  if (!candidate.withinBudget && !current.withinBudget && candidate.bytes < current.bytes) {
    return candidate;
  }
  return current;
}

/**
 * Video: a full binary search would re-encode the whole file many times.
 * Instead compute a bitrate analytically from the budget, encode once, and
 * apply at most one corrective re-encode if the first result missed.
 */
async function analyticThenVerify(
  opts: TargetSizeOptions,
  maxIter: number,
  signal: AbortSignal | undefined,
): Promise<TargetSizeResult> {
  const { encode, budgetBytes, analyticGuess } = opts;
  if (!analyticGuess) {
    throw new TypeError("strategy 'analytic-then-verify' requires an analyticGuess()");
  }

  const abort = signal ?? new AbortController().signal;
  let iterations = 0;
  let budgetForGuess = budgetBytes;
  let best: TargetSizeResult | null = null;

  const verifyPasses = Math.min(2, maxIter);
  for (let pass = 0; pass < verifyPasses; pass += 1) {
    throwIfAborted(signal);
    const params = clampParams(analyticGuess(budgetForGuess), opts.searchSpace);
    const output = await encode(params, abort);
    iterations += 1;
    const bytes = output.byteLength;
    const withinBudget = bytes <= budgetBytes;
    const candidate: TargetSizeResult = {
      output,
      bytes,
      params,
      withinBudget,
      sacrifice: {
        qualityReduced: params.quality < opts.searchSpace.quality.max,
        scaled: params.scale < (opts.searchSpace.scale?.max ?? 1),
      },
      iterations,
    };
    if (best === null || (withinBudget && !best.withinBudget) || (withinBudget && bytes > best.bytes)) {
      best = candidate;
    }
    if (withinBudget) break;
    // Overshot: scale the guess budget down proportionally and correct once.
    budgetForGuess = Math.floor(budgetForGuess * (budgetBytes / bytes) * 0.95);
  }

  return { ...(best as TargetSizeResult), iterations };
}

function clampParams(p: EncodeParams, space: TargetSizeOptions['searchSpace']): EncodeParams {
  const clamp = (v: number, r: Range) => Math.min(r.max, Math.max(r.min, v));
  const scaleRange = space.scale ?? { min: 1, max: 1 };
  return {
    quality: clamp(p.quality, space.quality),
    scale: clamp(p.scale, scaleRange),
  };
}
