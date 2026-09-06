/**
 * How many people used the site recently, stated on the landing page.
 *
 * The figure is baked in at BUILD time (see vite.config.ts and
 * scripts/fetch-visitors.mjs), not fetched by the page. A visitor counter that
 * called an API on every load would put a request on the one page whose whole
 * claim is that it does not phone home, and would need a server to count with.
 *
 * The consequence is that the number is as old as the last build, which is why
 * the site rebuilds nightly and why the copy says "more than", never an exact
 * total. It is rounded DOWN so that a stale figure understates rather than
 * overstates.
 *
 * Unset means the line is absent, not broken: a build with no analytics token
 * simply does not mention visitors.
 */

declare const __VISITORS_30D__: number;

/**
 * Whatever the build was told, or 0 when it was told nothing.
 *
 * Read through `typeof` rather than directly: this module is also pulled into
 * the separate prerender build and into the test run, and a missing define
 * should mean "no figure" rather than a ReferenceError that takes a page down.
 */
export const VISITORS_30D: number =
  typeof __VISITORS_30D__ === 'number' ? __VISITORS_30D__ : 0;

/**
 * Below this the sentence is not worth writing. "More than 40 visitors" is a
 * worse thing to say than nothing.
 */
export const MIN_VISITORS = 1000;

/**
 * Three significant digits, rounded down.
 *
 * Down rather than to-nearest because the figure is already up to a day old and
 * only ever grows: understating it stays true for longer.
 */
export function roundDown(n: number): number {
  if (n < 1000) return Math.floor(n);
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.floor(n / magnitude) * magnitude;
}

/** Whether this build has a figure worth printing. */
export function showsVisitors(n: number = VISITORS_30D): boolean {
  return Number.isInteger(n) && n >= MIN_VISITORS;
}
