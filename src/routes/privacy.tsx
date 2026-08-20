import { A } from '@solidjs/router';
import { useSeo } from '../lib/seo';

/**
 * Privacy Policy — a Read surface, and a hard requirement for AdSense approval
 * (docs/07) and for the brand's core claim (docs/08). Content is derived from
 * the product's actual behaviour: files are processed locally; the page itself
 * loads third-party ad/analytics scripts like any site. NO component-library JS
 * (keeps it light). Precise, never overclaiming.
 *
 * The operator is in Mumbai, Maharashtra, India, so the DPDP Act 2023 is the
 * law that governs us; other regimes are named as additional rights a visitor
 * may hold, not as claims about who we are. The contact address is live and
 * monitored. Still worth a lawyer's read before it carries real weight.
 */
export default function Privacy() {
  useSeo('privacy');
  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">Privacy Policy</h1>
      <p class="mt-2 text-sm text-muted">Last updated: 24 July 2026</p>

      <div class="mt-8 space-y-8 text-sm leading-relaxed text-fg">
        <section>
          <p>
            YappyKit is built so your files never leave your device.{' '}
            <strong>
              Your selected files are processed locally in your browser and are not uploaded to our
              application servers.
            </strong>{' '}
            Advertising, analytics and other third-party scripts on the page may still make ordinary
            network requests, as on any website. This policy explains that distinction precisely.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold">Your files vs. the page</h2>
          <p class="mt-2">Two separate things happen on a YappyKit page:</p>
          <div class="mt-3 overflow-hidden rounded border border-border">
            <table class="w-full text-left">
              <thead>
                <tr class="bg-surface text-muted">
                  <th class="px-3 py-2 font-medium">What</th>
                  <th class="px-3 py-2 font-medium">Where it happens</th>
                  <th class="px-3 py-2 font-medium">Leaves your device?</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-t border-border">
                  <td class="px-3 py-2">Your file (photo, PDF, spreadsheet, video)</td>
                  <td class="px-3 py-2">Your browser (JavaScript / WebAssembly)</td>
                  <td class="px-3 py-2 font-semibold text-success">No</td>
                </tr>
                <tr class="border-t border-border">
                  <td class="px-3 py-2">The page itself (scripts, ads, analytics)</td>
                  <td class="px-3 py-2">Loaded from a CDN; ad/analytics talk to their providers</td>
                  <td class="px-3 py-2 text-muted">Yes, as any web page does</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-3">
            Your <em>content</em> is private. Your <em>visit</em> is as private as any ad-supported
            web page, subject to normal third-party tracking. You can verify the first row yourself:
            open your browser's developer tools, go to the Network tab, run any tool, and observe that
            no request carries your file.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold">What we do and don't collect</h2>
          <ul class="mt-2 list-disc space-y-1 ps-5">
            <li>We do not receive, store, or transmit the files you process. There is no upload.</li>
            <li>We do not require an account and do not ask for your name or email to use the tools.</li>
            <li>
              Third-party services on the page (advertising and analytics) may set cookies and receive
              your IP address, device and browser information, and advertising identifiers, the same
              data those services receive on any site that uses them.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-semibold">Third-party services</h2>
          <p class="mt-2">
            YappyKit is free and supported by advertising. The pages use, or may use, the following
            third parties, each governed by its own privacy policy:
          </p>
          <ul class="mt-2 list-disc space-y-1 ps-5">
            <li>
              <strong>Advertising</strong> (e.g. Google AdSense): serves ads and may use cookies and
              device identifiers to measure and personalise them.
            </li>
            <li>
              <strong>Analytics</strong>: measures aggregate, anonymous usage so we can improve the
              tools.
            </li>
            <li>
              <strong>Content delivery network (CDN)</strong>: serves the site's static files (the
              app code, not your files).
            </li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-semibold">What is stored on your device</h2>
          <p class="mt-2">
            To make the tools work and remember your preferences, YappyKit stores a small amount of
            data <em>on your device</em> (not on our servers): your light/dark theme choice, and
            cached program assets (via the browser cache, IndexedDB or OPFS) so tools load faster and
            work offline. You can clear this at any time from your browser's site settings, and OCR or
            other model downloads are cached the same way.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold">Cookies &amp; consent</h2>
          <p class="mt-2">
            Where your jurisdiction requires it, we ask for your consent before advertising cookies
            that personalise ads are set. You can change or withdraw consent at any time.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold">Your rights</h2>
          <p class="mt-2">
            We operate from Mumbai, Maharashtra, India, so India's Digital Personal Data Protection
            Act, 2023 applies to us. If you are in another jurisdiction, its own law may give you
            further rights, for example the EU or UK GDPR.
          </p>
          <p class="mt-2">
            Those rights typically include access to personal data held about you, correction of it,
            erasure of it, and objecting to certain processing. In practice there is very little for
            us to act on: we hold no account and none of your files. Requests therefore concern the
            advertising and analytics providers listed above, and you can exercise your rights
            directly with them as well as through us.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold">Contact</h2>
          <p class="mt-2">
            Questions about this policy or your privacy? Contact us at{' '}
            <a class="text-accent underline" href="mailto:osappsupport@gmail.com">
              osappsupport@gmail.com
            </a>
            .
          </p>
        </section>

        <p class="border-t border-border pt-6 text-muted">
          <A href="/" class="text-accent underline">
            ← Back to YappyKit
          </A>
        </p>
      </div>
    </main>
  );
}
