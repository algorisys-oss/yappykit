import { For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useI18n, SHIPPED } from '../i18n/runtime';
import { resolveRoute, pathFor } from '../i18n/routes';

/**
 * Site-wide footer.
 *
 * It lives in the root layout rather than inside the landing page, because
 * AdSense review and ordinary users both expect the Privacy Policy reachable
 * from EVERY page — previously these links existed only on the home page.
 *
 * The language list emits a real <a> per locale pointing at the SAME page in
 * that language. hreflang tells Google the pages are equivalent; these links are
 * how it reaches them in the first place.
 */
export default function Footer() {
  const { m, parts, path } = useI18n();
  const location = useLocation();

  // Switch language without leaving the page: resolve the current URL back to a
  // route key, then re-emit it in the target locale. Falls back to that
  // locale's home page for any URL that is not a known route.
  const here = () => resolveRoute(location.pathname);

  return (
    <footer class="border-t border-border">
      <div class="mx-auto max-w-4xl px-6 py-8">
        <nav class="mb-3 flex flex-wrap gap-4 text-sm" aria-label={m.common.footerNav}>
          <A href={path('home')} class="text-muted no-underline hover:text-accent">
            {m.common.footerHome}
          </A>
          <A href={path('about')} class="text-muted no-underline hover:text-accent">
            {m.common.footerAbout}
          </A>
          <A href="/privacy" class="text-muted no-underline hover:text-accent">
            {m.common.footerPrivacy}
          </A>
          <A href="/terms" class="text-muted no-underline hover:text-accent">
            {m.common.footerTerms}
          </A>
        </nav>

        <Show when={SHIPPED.length > 1}>
          <nav aria-label={m.common.languageLabel} class="mb-4">
            <ul class="flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
              <For each={SHIPPED}>
                {(l) => {
                  const target = () => {
                    const hit = here();
                    return hit ? pathFor(hit.key, l.code) : pathFor('home', l.code);
                  };
                  return (
                    <li>
                      <a
                        href={target()}
                        hreflang={l.code}
                        lang={l.code}
                        // rel="external" is load-bearing, not decoration.
                        // solid-router intercepts same-origin anchor clicks and
                        // navigates client-side; the active locale is fixed for
                        // the lifetime of the document, so an intercepted click
                        // would change the URL to /es/... while leaving the
                        // English messages loaded — the page stays English until
                        // the visitor manually refreshes. Each locale has its own
                        // prerendered document, <html lang> and canonical, so
                        // switching language must actually fetch that document.
                        rel="external"
                        class="text-muted no-underline hover:text-accent"
                      >
                        {l.name}
                      </a>
                    </li>
                  );
                }}
              </For>
            </ul>
          </nav>
        </Show>

        <p class="max-w-2xl text-xs text-muted">
          <For each={parts(m.common.footerNote)}>
            {(p) =>
              'text' in p ? (
                <>{p.text}</>
              ) : p.token === 'privacy' ? (
                <A href="/privacy" class="underline hover:text-accent">
                  {m.common.footerPrivacyLink}
                </A>
              ) : (
                <></>
              )
            }
          </For>
        </p>
      </div>
    </footer>
  );
}
