/**
 * Saving a still from a video, with no video engine at all.
 *
 * The browser has already decoded the frame it is showing, so a canvas the size
 * of the video can take it at full resolution. What the browser does not say is
 * the frame rate, so stepping one frame is a search for the nearest time at
 * which a different frame is on screen, which is exact for a variable rate
 * recording too.
 *
 * "A different frame" is decided by pixels, not by the browser's frame callback.
 * Measured on 2026-09-13 with a 15 fps clip: Chromium's `requestVideoFrameCallback`
 * reports the presented frame's own time (0.933, 1.0, 1.067), but Firefox's
 * echoes whatever time was seeked to (1.01, 1.02), so it cannot tell two frames
 * apart. A frame re-shown is decoded identically, so any pixel that differs
 * means the frame changed, in every browser.
 *
 * Pure, so it is tested without a browser. The page drives it.
 */

export type FrameFormat = 'png' | 'jpeg';

export const FRAME_FORMATS: Record<FrameFormat, { mime: string; ext: string; quality: number | undefined }> = {
  png: { mime: 'image/png', ext: 'png', quality: undefined },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', quality: 0.92 },
};

/** Smaller than a frame at 120 fps, so the search cannot settle past a whole frame. */
export const STEP_PROBE_SEC = 1 / 240;

/** The end of a video shows nothing, so a step stops just short of it. */
const END_MARGIN = 0.001;

/**
 * The time to seek to for the frame next to the one shown at `from`.
 *
 * `differs(t)` seeks to `t` and says whether a different picture is on screen.
 * That answer stays yes from the neighbouring frame onwards, so the search
 * doubles its reach until the picture changes and then bisects back between
 * the last same picture and the first different one, until the two are a
 * probe apart. The result is inside the neighbouring frame however far the
 * doubling overshot: a frame is longer than a probe, so no whole frame fits in
 * the final gap. Measured in Firefox, a seek costs about 50 ms, and stepping
 * one probe at a time needed 16 seeks per frame at 15 fps; this needs 8, and
 * crosses a two second slideshow frame in 15 instead of giving up.
 *
 * Null when there is no neighbouring frame before the edge of the video.
 */
export async function findNeighbourFrame(
  from: number,
  direction: 1 | -1,
  duration: number,
  differs: (t: number) => Promise<boolean>,
): Promise<number | null> {
  const edge = direction === 1 ? Math.max(0, duration - END_MARGIN) : 0;
  const clampToEdge = (t: number) => (direction === 1 ? Math.min(t, edge) : Math.max(t, edge));

  let same = from;
  let reach = STEP_PROBE_SEC;
  let changed: number;
  for (;;) {
    const t = clampToEdge(from + direction * reach);
    if (t === same) return null;
    if (await differs(t)) {
      changed = t;
      break;
    }
    same = t;
    if (t === edge) return null;
    reach *= 2;
  }

  while (Math.abs(changed - same) > STEP_PROBE_SEC) {
    const mid: number = (same + changed) / 2;
    if (await differs(mid)) changed = mid;
    else same = mid;
  }
  return changed;
}

/**
 * Whether two same-sized pixel buffers show different frames.
 *
 * Exact comparison is right here, not a tolerance: the same frame decoded twice
 * is bit-identical, and two real neighbouring frames that happen to be identical
 * are, for someone picking a still, the same picture.
 */
export function framesDiffer(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

/** `name-01m05.235s.png`: the video's name and the moment, with no colons. */
export function frameFileName(videoName: string, seconds: number, ext: string): string {
  const dot = videoName.lastIndexOf('.');
  const stem = dot > 0 ? videoName.slice(0, dot) : videoName;
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = (ms - minutes * 60000) / 1000;
  return `${stem}-${String(minutes).padStart(2, '0')}m${rest.toFixed(3).padStart(6, '0')}s.${ext}`;
}
