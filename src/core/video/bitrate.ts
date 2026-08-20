/**
 * Video bitrate planning — the analytic half of "analytic-then-verify".
 *
 * A full binary search would re-encode the whole video many times, so instead we
 * compute the target video bitrate directly from the size budget and duration,
 * encode once, and (optionally) correct once. Pure and unit-tested; the encoder
 * (ffmpeg.wasm) is a separate, lazy module.
 */

export const MIN_VIDEO_KBPS = 50; // below this, H.264 output is unwatchable

export interface BitratePlanInput {
  targetBytes: number;
  durationSec: number;
  audioKbps?: number;
  /** Fraction of the budget left for media after container overhead. */
  overhead?: number;
}

export interface BitratePlan {
  videoKbps: number;
  audioKbps: number;
  /**
   * False when even the minimum bitrate can't fit the budget (we clamped up to
   * MIN_VIDEO_KBPS) — the UI should warn the result may exceed the target.
   */
  feasible: boolean;
}

export function planBitrate(input: BitratePlanInput): BitratePlan {
  const { targetBytes, durationSec } = input;
  if (durationSec <= 0) throw new RangeError('durationSec must be positive');
  if (targetBytes <= 0) throw new RangeError('targetBytes must be positive');

  const audioKbps = input.audioKbps ?? 128;
  const overhead = input.overhead ?? 0.97;

  const targetBits = targetBytes * 8 * overhead;
  const audioBits = audioKbps * 1000 * durationSec;
  const videoBits = targetBits - audioBits;
  const rawKbps = Math.floor(videoBits / durationSec / 1000);

  return {
    videoKbps: Math.max(rawKbps, MIN_VIDEO_KBPS),
    audioKbps,
    feasible: rawKbps >= MIN_VIDEO_KBPS,
  };
}

/** Correct the bitrate after a first pass overshot/undershot the budget. */
export function correctBitrate(previousKbps: number, actualBytes: number, targetBytes: number): number {
  if (actualBytes <= 0) return previousKbps;
  // Scale inversely with the size error, with a small safety margin.
  const next = Math.floor(previousKbps * (targetBytes / actualBytes) * 0.97);
  return Math.max(next, MIN_VIDEO_KBPS);
}
