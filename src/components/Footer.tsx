import { For, Show } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { useI18n, SHIPPED } from '../i18n/runtime';
import { resolveRoute, pathFor } from '../i18n/routes';
import VersionBadge from './VersionBadge';

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

        {/* Attribution and the source link. Inline SVG rather than an icon
            font or a component-library icon: the footer rides on the landing
            page, which ships no component-library JS and is budget-gated. */}
        <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <p class="m-0 flex items-center gap-1">
            <For each={parts(m.common.footerMadeBy)}>
              {(p) =>
                'text' in p ? (
                  <>{p.text}</>
                ) : p.token === 'heart' ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="inline-block text-danger"
                    role="img"
                    aria-label={m.common.footerHeart}
                  >
                    <path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z" />
                  </svg>
                ) : p.token === 'company' ? (
                  <a
                    href="https://www.algorisys.com"
                    // Leaves the site, so it must not be intercepted by the
                    // client-side router.
                    rel="external noopener"
                    target="_blank"
                    class="text-muted underline hover:text-accent"
                  >
                    Algorisys Technologies
                  </a>
                ) : (
                  <></>
                )
              }
            </For>
          </p>

          <a
            href="https://github.com/algorisys-oss/yappykit"
            rel="external noopener"
            target="_blank"
            class="inline-flex items-center gap-1 text-muted no-underline hover:text-accent"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" />
            </svg>
            {m.common.footerStar}
          </a>
        </div>

        <VersionBadge />

        <p class="mt-4 max-w-2xl text-xs text-muted">
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
