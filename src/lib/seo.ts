import { onMount } from 'solid-js';
import { useI18n } from '../i18n/runtime';
import { metaFor } from '../i18n/meta';
import { urlFor, type RouteKey } from '../i18n/routes';

/**
 * Per-route SEO for client-side navigation.
 *
 * The static <head> is written by the prerenderer (src/prerender/head.ts) and is
 * what crawlers read. This re-applies the same values after an in-app
 * navigation, where no new document is fetched.
 *
 * It takes a ROUTE KEY, not a path or a title. Every value is then derived from
 * the route table and the active locale, which is the point: the previous
 * signature let each route pass its own literal path, and every tool route
 * passed the ENGLISH one — so on /es/... this function overwrote the correct
 * prerendered canonical with the English URL, telling Google the translated page
 * was a duplicate. Deriving it makes that unrepresentable.
 */
export function useSeo(key: RouteKey): void {
  const { m, locale } = useI18n();
  onMount(() => {
    const meta = metaFor(key, m);
    const url = urlFor(key, locale);
    document.title = meta.title;
    upsertMeta('name', 'description', meta.description);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertCanonical(url);
  });
}

function upsertMeta(keyAttr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${keyAttr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(keyAttr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}
