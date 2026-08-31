/**
 * Capability gate.
 *
 * Everything in YappyKit hinges on feature presence varying wildly across
 * browsers and devices (WebCodecs, SharedArrayBuffer, OPFS, WebGPU). This
 * module is a HARD gate, not an afterthought: every tool declares what it
 * needs, and we decide up front whether to run the fast path, the slow
 * fallback, or to degrade honestly and tell the user.
 *
 * Detection is cheap and synchronous where possible; anything that needs an
 * async probe (OPFS handle, WebGPU adapter) is exposed as a separate async
 * check so the synchronous snapshot stays fast for first paint.
 */

export type Capability =
  | 'webWorkers'
  | 'offscreenCanvas'
  | 'createImageBitmap'
  | 'webCodecs'
  | 'sharedArrayBuffer'
  | 'crossOriginIsolated'
  | 'opfs'
  | 'webgpu'
  | 'wasm'
  | 'decompressionStream'
  | 'localFonts';

export type CapabilitySnapshot = Record<Capability, boolean>;

/** Synchronous, allocation-free feature detection. Safe to call at startup. */
export function detectCapabilities(): CapabilitySnapshot {
  const g = globalThis as typeof globalThis & {
    crossOriginIsolated?: boolean;
    GPU?: unknown;
  };

  return {
    webWorkers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    createImageBitmap: typeof createImageBitmap === 'function',
    webCodecs:
      typeof (g as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined' &&
      typeof (g as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined',
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    // Threads only actually work when the page is cross-origin isolated.
    crossOriginIsolated: g.crossOriginIsolated === true,
    opfs:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage?.getDirectory === 'function',
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    wasm: typeof WebAssembly !== 'undefined',
    // The ffmpeg core ships gzipped to fit the host's per-file size limit, so
    // expanding it is a hard requirement of the video tool, not a nicety.
    decompressionStream: typeof DecompressionStream !== 'undefined',
    // Local Font Access: reading the installed font list, behind a permission
    // prompt. Chromium desktop only, and no tool may require it.
    localFonts:
      typeof (globalThis as { queryLocalFonts?: unknown }).queryLocalFonts === 'function',
  };
}

/** A tool's hard requirements and the fast-path features it can use if present. */
export interface CapabilitySpec {
  /** Missing any of these → the tool cannot run at all; show an honest message. */
  required: Capability[];
  /** Present → fast path; absent → slower fallback, but the tool still works. */
  preferred?: Capability[];
}

export interface CapabilityVerdict {
  /** The tool can run (all `required` satisfied). */
  supported: boolean;
  /** All `preferred` satisfied → no degradation. */
  fastPath: boolean;
  /** Required capabilities that are missing (empty when `supported`). */
  missingRequired: Capability[];
  /** Preferred capabilities that are missing (drives the "slower path" notice). */
  missingPreferred: Capability[];
}

export function evaluate(
  spec: CapabilitySpec,
  snapshot: CapabilitySnapshot = detectCapabilities(),
): CapabilityVerdict {
  const missingRequired = spec.required.filter((c) => !snapshot[c]);
  const missingPreferred = (spec.preferred ?? []).filter((c) => !snapshot[c]);
  return {
    supported: missingRequired.length === 0,
    fastPath: missingRequired.length === 0 && missingPreferred.length === 0,
    missingRequired,
    missingPreferred,
  };
}

/** Async probe: does OPFS actually grant a directory handle here? */
export async function canUseOpfs(): Promise<boolean> {
  try {
    if (!detectCapabilities().opfs) return false;
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

/** Async probe: is a real WebGPU adapter available (not just the API surface)? */
export async function canUseWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}
