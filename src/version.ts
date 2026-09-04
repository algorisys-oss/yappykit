/**
 * What is running, and what it was built from.
 *
 * Both values are substituted by Vite at build time (see vite.config.ts), so
 * they cost nothing at runtime and cannot drift from the bundle they describe.
 * The commit is decoration and may be empty when the build had no git.
 */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

export const VERSION: string = __APP_VERSION__;
export const COMMIT: string = __APP_COMMIT__;

/** "0.1.0" or "0.1.0 (b5fe5df)" when the commit is known. */
export const VERSION_LABEL = COMMIT ? `${VERSION} (${COMMIT})` : VERSION;
