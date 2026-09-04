/**
 * Applying a new version.
 *
 * The service worker serves the tools offline, which also means a visitor can
 * sit on a cached build after a new one has deployed. `registerSW` hands back
 * an updater; keeping hold of it lets the footer offer a button that actually
 * activates the waiting worker rather than doing a reload that re-reads the
 * same cache.
 */
type Updater = (reloadPage?: boolean) => Promise<void>;

let updater: Updater | null = null;

export function rememberUpdater(fn: Updater): void {
  updater = fn;
}

/** Take the newest build if there is one, then reload either way. */
export async function refreshApp(): Promise<void> {
  try {
    // Ask any registered worker to check the server before we reload, so the
    // reload lands on the new build rather than a stale cache.
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
    if (updater) {
      await updater(true);
      return;
    }
  } catch {
    // A blocked or unsupported service worker is not a reason to refuse to
    // reload; it just means there was nothing to activate first.
  }
  window.location.reload();
}
