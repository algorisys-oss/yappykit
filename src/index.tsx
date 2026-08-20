import { render } from 'solid-js/web';
import { initAnalytics } from './lib/analytics';
import { Router, Route, useLocation } from '@solidjs/router';
import { createEffect, lazy, type Component, type ParentProps } from 'solid-js';
import 'virtual:uno.css';
import '@algorisys/zen-ui-core/tokens.css'; // shared --zen-color-* palette (light + dark)
import './styles/tokens.css';
import { registerSW } from 'virtual:pwa-register';
import Landing from './routes/index';
import Header from './components/Header';
import Footer from './components/Footer';
import { I18nProvider, SHIPPED, loadMessages, localeFromPath } from './i18n/runtime';
import { getLocale } from './i18n/locales';
import { ROUTE_KEYS, ROUTES, pathFor, resolveRoute, type RouteKey } from './i18n/routes';

// Register the service worker so the tools keep working offline once cached.
registerSW({ immediate: true });

// Tool routes are lazy so their (eventually heavy) code and WASM never land in
// the landing-page bundle. The landing route is imported eagerly because it is
// the SEO asset and must paint immediately.
const COMPONENTS: Record<RouteKey, Component> = {
  home: Landing,
  'image-compress': lazy(() => import('./routes/tools/image-compressor')),
  'spreadsheet-compare': lazy(() => import('./routes/tools/spreadsheet-compare')),
  'metadata-remove': lazy(() => import('./routes/tools/metadata-cleaner')),
  'video-compress': lazy(() => import('./routes/tools/video-compressor')),
  'passport-photo': lazy(() => import('./routes/tools/passport-photo')),
  'document-scan': lazy(() => import('./routes/tools/document-scanner')),
  'mouse-test': lazy(() => import('./routes/tools/mouse-test')),
  'keyboard-test': lazy(() => import('./routes/tools/keyboard-test')),
  ruler: lazy(() => import('./routes/tools/ruler')),
  'pdf-compress': lazy(() => import('./routes/tools/pdf-compressor')),
  'camera-mic-test': lazy(() => import('./routes/tools/camera-mic-test')),
  'random-word': lazy(() => import('./routes/tools/random-word')),
  about: lazy(() => import('./routes/about')),
  privacy: lazy(() => import('./routes/privacy')),
  terms: lazy(() => import('./routes/terms')),
};

const NotFound = lazy(() => import('./routes/not-found'));

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

/**
 * Every route in every shipped locale.
 *
 * Generated from the route table rather than listed by hand: a locale or a tool
 * is added in one place and the router, the prerenderer, the sitemap and the
 * hreflang cluster all pick it up together, so they cannot drift apart.
 */
function routePaths(): { key: RouteKey; path: string }[] {
  const out: { key: RouteKey; path: string }[] = [];
  for (const key of ROUTE_KEYS) {
    if (!ROUTES[key].localized) {
      out.push({ key, path: pathFor(key, 'en') });
      continue;
    }
    for (const l of SHIPPED) out.push({ key, path: pathFor(key, l.code) });
  }
  return out;
}

async function start() {
  const locale = localeFromPath(window.location.pathname);
  const messages = await loadMessages(locale);

  // The page arrives with prerendered HTML inside #root (see src/prerender).
  // Solid's render() INSERTS into the container, so without clearing it first
  // the static copy and the rendered app would both be on the page.
  root!.replaceChildren();

  document.documentElement.lang = locale;
  document.documentElement.dir = getLocale(locale).dir;

  function Layout(props: ParentProps) {
    const location = useLocation();

    // The active locale is fixed for the lifetime of the DOCUMENT: its messages
    // were loaded once at boot, and <html lang>, the canonical and the hreflang
    // set all belong to it. Every in-app link is generated for the current
    // locale, so this should never trigger — but if a client-side navigation
    // ever lands on a URL belonging to a different locale, rendering would
    // silently continue in the old language at the new URL. Fetch the right
    // document instead.
    //
    // Unlocalized routes (the English-only Privacy Policy) are exempt: they are
    // shown inside whatever shell the visitor already has, so reading the policy
    // does not eject a Spanish visitor back into English.
    createEffect(() => {
      const hit = resolveRoute(location.pathname);
      if (!hit || !ROUTES[hit.key].localized || hit.locale === locale) return;
      window.location.assign(location.pathname + location.search + location.hash);
    });

    return (
      <I18nProvider locale={locale} messages={messages}>
        <Header />
        {props.children}
        <Footer />
      </I18nProvider>
    );
  }

  render(
    () => (
      <Router root={Layout}>
        {/* Static list — solid-router reads Route children at setup, so this
            must be a plain array, not a reactive <For>. */}
        {routePaths().map((r) => (
          <Route path={r.path} component={COMPONENTS[r.key]} />
        ))}
        <Route path="*" component={NotFound} />
      </Router>
    ),
    root!,
  );
}

void start();

// Deliberately not awaited: analytics must never delay the page, and it decides
// for itself whether it is allowed to run at all (see lib/analytics).
void initAnalytics();
