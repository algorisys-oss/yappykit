/**
 * Which browsers can run which tool, derived rather than asserted.
 *
 * A hand-written "works in Chrome, Firefox, Safari" badge is a claim nobody
 * checks and everybody's stops being true. This computes the answer from the
 * capabilities a tool already declares (./tools) against one table of when each
 * capability shipped, so a tool that changes what it needs changes what its
 * page says about browsers on the same commit.
 *
 * The version table is the one part that goes stale on its own, because it is
 * about the outside world rather than about this code. It therefore carries
 * SUPPORT_VERIFIED and is shown to the reader with that date, the same way
 * core/photo/presets handles official photo specs.
 */
import type { Capability, CapabilitySpec } from './index';

export type BrowserId = 'chrome' | 'firefox' | 'safari' | 'edge';

/** Browsers, not engines: nobody looks for "Blink" in a support table. */
export const BROWSERS: readonly { id: BrowserId; label: string }[] = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'safari', label: 'Safari' },
  { id: 'edge', label: 'Edge' },
];

/** Re-check the table below against https://caniuse.com and MDN, then move this. */
export const SUPPORT_VERIFIED = '2026-09-04';

/**
 * The floor the build itself sets.
 *
 * vite.config.ts compiles to `es2022`, so anything older cannot execute the
 * bundle whatever features it has. No tool can claim support below this line.
 *
 * These are the versions that took the LAST piece of ES2022, which is class
 * static initialisation blocks. Safari is the straggler by more than a year:
 * most of ES2022 was in Safari 15, static blocks only landed in 16.4, and
 * taking the earlier number would advertise a Safari that cannot parse the
 * bundle at all.
 */
export const BASELINE: Record<BrowserId, number> = {
  chrome: 94,
  firefox: 93,
  safari: 16.4,
  edge: 94,
};

/** First version of each browser to ship the capability. null: never has. */
const SINCE: Record<Capability, Record<BrowserId, number | null>> = {
  webWorkers: { chrome: 4, firefox: 3.5, safari: 4, edge: 12 },
  wasm: { chrome: 57, firefox: 52, safari: 11, edge: 16 },
  createImageBitmap: { chrome: 50, firefox: 42, safari: 15, edge: 79 },
  offscreenCanvas: { chrome: 69, firefox: 105, safari: 16.4, edge: 79 },
  webCodecs: { chrome: 94, firefox: 130, safari: 16.4, edge: 94 },
  sharedArrayBuffer: { chrome: 68, firefox: 79, safari: 15.2, edge: 79 },
  // Not a browser feature but a page state, and it became reachable when the
  // COOP/COEP isolation model landed alongside SharedArrayBuffer.
  crossOriginIsolated: { chrome: 68, firefox: 79, safari: 15.2, edge: 79 },
  opfs: { chrome: 86, firefox: 111, safari: 15.2, edge: 86 },
  webgpu: { chrome: 113, firefox: 141, safari: 18, edge: 113 },
  decompressionStream: { chrome: 80, firefox: 113, safari: 16.4, edge: 80 },
  // Local Font Access is Chromium-only and shows no sign of changing.
  localFonts: { chrome: 103, firefox: null, safari: null, edge: 103 },
};

export interface BrowserVerdict {
  id: BrowserId;
  label: string;
  /** Lowest version that can run the tool at all. null: this browser cannot. */
  minVersion: number | null;
  /**
   * Lowest version that also gets every fast path. null: this browser never
   * does, either because it cannot run the tool or because one of the
   * preferred capabilities has never shipped here.
   *
   * Equal to `minVersion` when there is no gap, which is the common case. When
   * it is higher, the versions in between run and run slowly, and saying only
   * "works from `minVersion`" would promise them a speed they do not have.
   */
  fastVersion: number | null;
}

export function supportFor(spec: CapabilitySpec): BrowserVerdict[] {
  return BROWSERS.map(({ id, label }) => {
    let min: number | null = BASELINE[id];
    for (const cap of spec.required) {
      const since = SINCE[cap][id];
      if (since === null) {
        min = null;
        break;
      }
      if (min !== null) min = Math.max(min, since);
    }

    let fast: number | null = min;
    for (const cap of spec.preferred ?? []) {
      const since = SINCE[cap][id];
      if (since === null) {
        fast = null;
        break;
      }
      if (fast !== null) fast = Math.max(fast, since);
    }

    return { id, label, minVersion: min, fastVersion: fast };
  });
}

/** Just the version floors, keyed by browser. Convenient for tests and copy. */
export function minimumFor(spec: CapabilitySpec): Record<BrowserId, number | null> {
  const out = {} as Record<BrowserId, number | null>;
  for (const b of supportFor(spec)) out[b.id] = b.minVersion;
  return out;
}
