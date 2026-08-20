/**
 * Google Analytics, loaded only where it is lawful to load it without asking.
 *
 * GA sets cookies and processes an IP address. In the EEA and the UK a visitor
 * has to consent BEFORE that happens, and this site has nothing to ask them
 * with. So it does not measure them at all.
 *
 * A home-made banner was the obvious alternative and is the wrong one: Google
 * requires a certified CMP from its own list for EEA and UK traffic once ads
 * are served, so a hand-rolled one would have to be replaced anyway, and a
 * consent dialog that does not meet the bar is worse than collecting nothing.
 * When a certified CMP arrives for AdSense, analytics consent rides along with
 * it and `analyticsAllowed` is where that decision changes.
 *
 * Not measuring Europe is a real cost, taken deliberately. For a product whose
 * entire claim is that it does not take your data, it is the cheaper of the two
 * costs.
 */

export const MEASUREMENT_ID = 'G-1FZ1NE7L5Y';

/** Only the live site measures anything; dev and the test suite never do. */
export const ANALYTICS_HOST = 'yappykit.com';

/**
 * EEA plus the UK: the countries where analytics needs prior consent.
 *
 * The 27 EU member states, the three non-EU EEA states (Iceland,
 * Liechtenstein, Norway) and the United Kingdom. Switzerland is deliberately
 * absent: it is neither EU nor EEA and its own FADP does not require prior
 * consent for analytics of this kind.
 */
export const CONSENT_REQUIRED: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB',
];

/**
 * Whether analytics may run for a visitor in this country.
 *
 * An unknown country is a NO. If the lookup fails we do not know whether the
 * visitor is protected, and guessing in favour of measurement is exactly the
 * trade this product exists not to make.
 */
export function analyticsAllowed(country: string | null | undefined): boolean {
  if (!country) return false;
  return !CONSENT_REQUIRED.includes(country.trim().toUpperCase());
}

/** Pull the country out of Cloudflare's trace body. */
export function countryFromTrace(body: string): string | null {
  const match = /(?:^|\n)loc=([A-Z]{2})\s*$/m.exec(body);
  return match ? match[1]! : null;
}

function injectTag(): void {
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(tag);

  const w = window as typeof window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer ?? [];
  const gtag = (...args: unknown[]) => {
    w.dataLayer!.push(args);
  };
  w.gtag = gtag;
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID);
}

/**
 * Decide, then load.
 *
 * `/cdn-cgi/trace` is Cloudflare's own endpoint on our own origin: it costs one
 * small same-origin request, sends no cookies, and tells us the country without
 * involving a third party in the question of whether a third party is allowed.
 */
export async function initAnalytics(): Promise<void> {
  if (location.hostname !== ANALYTICS_HOST) return;
  try {
    const res = await fetch('/cdn-cgi/trace', { credentials: 'omit' });
    if (!res.ok) return;
    if (analyticsAllowed(countryFromTrace(await res.text()))) injectTag();
  } catch {
    // Offline, blocked, or no Cloudflare in front of us. Measure nothing.
  }
}
