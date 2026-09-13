/**
 * Holding back a new version while somebody is in the middle of something.
 *
 * The service worker is registered in auto-update mode, and in that mode
 * vite-plugin-pwa calls `window.location.reload()` the moment a new worker
 * activates. So every deploy reloaded every open tab, including one forty
 * minutes into encoding a video, taking the file, the edits and the export with
 * it. `onNeedReload` is the plugin's hook for replacing that reload, and this is
 * what it is replaced with: reload now if nothing is held, otherwise wait until
 * the last tool holding work lets go, which is usually the user leaving it.
 *
 * Waiting leaves an old build running in that tab, which is the right trade: it
 * already has its code loaded, and the alternative is destroying work.
 */
import { createEffect, onCleanup, type Accessor } from 'solid-js';

let held = 0;
let pending: (() => void) | null = null;

export function heldCount(): number {
  return held;
}

/** Take a hold; the returned function releases it, once. */
export function holdWork(): () => void {
  held += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    if (held === 0 && pending) {
      const reload = pending;
      pending = null;
      // After the current task, so a hold released by leaving a page reloads
      // into the page being navigated to rather than the one being left.
      setTimeout(reload, 0);
    }
  };
}

export function reloadWhenIdle(reload: () => void): void {
  if (held === 0) {
    pending = null;
    setTimeout(reload, 0);
    return;
  }
  pending = reload;
}

/** Hold work for as long as `active` is true, and let go on unmount. */
export function useHoldWorkWhile(active: Accessor<boolean>): void {
  let release: (() => void) | null = null;
  const letGo = () => {
    if (!release) return;
    const r = release;
    release = null;
    r();
  };
  createEffect(() => {
    if (active()) release ??= holdWork();
    else letGo();
  });
  onCleanup(letGo);
}
