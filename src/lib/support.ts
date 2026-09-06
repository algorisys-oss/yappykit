/**
 * The Contribute link.
 *
 * YappyKit deploys as a static site: there is no server in the shipped build,
 * which rules out Razorpay's Standard Checkout (it needs a server to create the
 * order and to verify the payment signature with the account's key_secret, and
 * a secret must never reach a Vite bundle). So this is the least-integrated
 * thing that works: a plain link out to a payment page Razorpay hosts. No
 * third-party script, nothing for the service worker to choke on offline, and
 * "no file leaves the device" stays literally true, because a link is a link
 * until someone clicks it.
 *
 * THE URL IS NOT COMMITTED, deliberately. It comes from the build environment
 * (VITE_SUPPORT_RAZORPAY_URL), set on the deployment host. A payment page URL is
 * public and could sit in a bundle safely, but a fork building from the OSS
 * mirror must not ship a Contribute button that pays us.
 *
 * The consequence: an unset variable means the button is ABSENT, not broken. If
 * it is missing from a deployed build, check that the host passes the variable
 * through to `vite build` before looking anywhere else.
 */

/** Hosts the link may point at, so a mis-set variable cannot redirect anyone. */
const ALLOWED_HOSTS = ['razorpay.com', 'razorpay.me', 'rzp.io'];

/**
 * True for an https URL on an allowed host.
 *
 * The value goes straight into an href, so it is validated rather than trusted:
 * a malformed one drops the link instead of rendering href="undefined", and the
 * scheme check means a javascript: value can never become clickable.
 */
function isSafeSupportUrl(raw: string): boolean {
  if (!raw) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // The dot matters: it is what stops notrazorpay.com from matching.
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const CONFIGURED: string = import.meta.env.VITE_SUPPORT_RAZORPAY_URL ?? '';

/** The contribute link, or null when none is configured for this build. */
export function contributeUrl(): string | null {
  return isSafeSupportUrl(CONFIGURED) ? CONFIGURED : null;
}

/** Exported for the unit test; not part of the public surface. */
export const __testing = { isSafeSupportUrl, ALLOWED_HOSTS };
