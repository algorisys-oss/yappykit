/**
 * Camera and microphone diagnostics.
 *
 * The useful part of a webcam test is not the picture. It is answering "why is
 * there no picture", and the browser already knows: getUserMedia rejects with a
 * specific DOMException name for each cause. Most testers swallow that and show
 * a blank rectangle. These helpers turn it into an actionable cause.
 */

export type MediaFault =
  | 'denied'      // permission refused, or blocked by policy
  | 'notFound'    // no device of that kind is attached
  | 'inUse'       // another application holds the device
  | 'insecure'    // page is not on a secure origin
  | 'unsupported' // the browser has no getUserMedia
  | 'overconstrained'
  | 'unknown';

/**
 * Whether this environment can capture at all, checked BEFORE asking.
 *
 * Kept separate from classifying a rejection: "the browser has no API" and
 * "this particular request failed" are different questions, and folding them
 * together made an environment without getUserMedia report every failure as
 * insecure.
 */
export function mediaSupport(): 'ok' | 'insecure' | 'unsupported' {
  const md = typeof navigator === 'undefined' ? undefined : (navigator.mediaDevices as MediaDevices | undefined);
  if (typeof md?.getUserMedia === 'function') return 'ok';
  // getUserMedia is only exposed on a secure origin, so on plain HTTP the API
  // is absent rather than failing, and the honest cause is the origin.
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
  return 'unsupported';
}

/**
 * Map a getUserMedia rejection to a cause.
 *
 * Names are checked rather than messages: the message is localised and varies
 * between engines, the name is specified. Chrome reports a busy device as
 * NotReadableError and Firefox historically as NotFoundError once the OS has
 * taken it, so both spellings are handled.
 */
export function classifyMediaError(err: unknown): MediaFault {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'notFound';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'inUse';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'overconstrained';
    default:
      return 'unknown';
  }
}

/**
 * Root-mean-square level of a time-domain buffer, as 0..1.
 *
 * RMS rather than peak: peak jumps on a single click and reads as "working"
 * when the microphone is in fact only picking up a keystroke. RMS tracks
 * sustained level, which is what tells someone their mic is actually live.
 */
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.min(1, Math.sqrt(sum / samples.length));
}

/** Quietest level treated as signal. Below this a mic is effectively silent. */
export const SILENCE_FLOOR = 0.004;

/** Convert a 0..1 level to dBFS, floored so silence does not render -Infinity. */
export function toDbfs(level: number, floorDb = -60): number {
  if (level <= 0) return floorDb;
  return Math.max(floorDb, 20 * Math.log10(level));
}

/** Map a level onto a 0..1 meter position using the dB scale the ear uses. */
export function meterFraction(level: number, floorDb = -60): number {
  const db = toDbfs(level, floorDb);
  return Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
}

export interface MicVerdict {
  heard: boolean;
  peak: number;
  /** True when a signal arrived but never rose above a usable level. */
  veryQuiet: boolean;
}

/**
 * Judge a microphone from the peak level observed so far.
 *
 * "Very quiet" is a separate outcome from "nothing at all" because they have
 * different causes: silence usually means the wrong device is selected or it is
 * muted in hardware, while a weak signal usually means input gain.
 */
export const QUIET_CEILING = 0.02;

export function judgeMic(peak: number): MicVerdict {
  return {
    heard: peak > SILENCE_FLOOR,
    peak,
    veryQuiet: peak > SILENCE_FLOOR && peak < QUIET_CEILING,
  };
}

export interface CameraFacts {
  width: number;
  height: number;
  frameRate: number | null;
  label: string;
}

/**
 * Read what the camera ACTUALLY delivered.
 *
 * A camera routinely ignores the requested resolution and returns whatever it
 * can, so the requested constraints say nothing useful. The track's own
 * settings are the truth, and are what a user comparing "1080p" claims needs.
 */
export function cameraFacts(settings: MediaTrackSettings, label: string): CameraFacts {
  return {
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    frameRate: settings.frameRate != null ? Math.round(settings.frameRate) : null,
    label: label || '',
  };
}

/** Common shorthand for a resolution, for people checking a spec claim. */
export function resolutionName(width: number, height: number): string | null {
  const shortEdge = Math.min(width, height);
  if (!shortEdge) return null;
  const named: Record<number, string> = {
    2160: '4K', 1440: '1440p', 1080: '1080p', 720: '720p', 480: '480p', 360: '360p', 240: '240p',
  };
  return named[shortEdge] ?? null;
}
