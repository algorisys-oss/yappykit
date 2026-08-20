/**
 * Builds the <head> for one prerendered page.
 *
 * This exists because the app is a client-rendered SPA served from static
 * hosting: without it every route ships the home page's title, description and
 * — the damaging one — its canonical, telling Google that every tool page is a
 * duplicate of the home page. Runtime patching (src/lib/seo.ts) fixes the DOM
 * only after JS runs, which is too late for the canonical and useless to
 * crawlers that do not execute JS at all.
 *
 * Everything here is derived from the route table and the locale's messages, so
 * head and body cannot disagree.
 */
import { LOCALES, DEFAULT_LOCALE, getLocale, type Locale, type LocaleCode } from '../i18n/locales';
import { alternatesFor, urlFor, pathFor, SITE, TOOL_KEYS, ROUTES, type RouteKey, type ToolKey } from '../i18n/routes';
import type { Messages } from '../i18n/messages/en';
import { metaFor } from '../i18n/meta';

export { metaFor };

export const OG_IMAGE = `${SITE}/og-image.png`;

/** Escape for HTML text and double-quoted attribute values. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialise JSON-LD. `<` must be escaped as <: a literal "</script>" in any
 * string would otherwise close the script element and inject markup.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function breadcrumb(key: RouteKey, locale: LocaleCode, m: Messages) {
  const items = [{ name: m.common.breadcrumbHome, url: urlFor('home', locale) }];
  if (key !== 'home') items.push({ name: metaFor(key, m).title, url: urlFor(key, locale) });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** The structured data for a page. Tool pages carry the rich-result types. */
export function structuredData(key: RouteKey, locale: LocaleCode, m: Messages): unknown[] {
  const out: unknown[] = [breadcrumb(key, locale, m)];

  if (key === 'home') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'YappyKit',
      url: urlFor('home', locale),
      inLanguage: locale,
      description: m.landing.seoDescription,
    });
    out.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: m.landing.toolsHeading,
      itemListElement: TOOL_KEYS.map((k, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: m.tools[k].title,
        url: urlFor(k, locale),
      })),
    });
    return out;
  }

  // Anything that is not a tool is a plain content page. Checked explicitly
  // against the tool list rather than by elimination: the previous version
  // assumed "not home/about/privacy means tool", so adding a route crashed here
  // instead of failing a type check.
  if (!(TOOL_KEYS as readonly string[]).includes(key)) {
    out.push({
      '@context': 'https://schema.org',
      '@type': key === 'about' ? 'AboutPage' : 'WebPage',
      name: metaFor(key, m).title,
      url: urlFor(key, locale),
      // The single-locale legal pages are English whatever shell they appear in.
      inLanguage: ROUTES[key].localized ? locale : DEFAULT_LOCALE,
    });
    return out;
  }

  const t = m.tools[key as ToolKey];
  out.push({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: t.title,
    url: urlFor(key, locale),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires a modern web browser with WebAssembly',
    inLanguage: locale,
    description: t.seoDescription,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  });
  out.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: t.content.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  });
  out.push({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: t.title,
    inLanguage: locale,
    step: t.content.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
  });
  return out;
}

export interface HeadOptions {
  key: RouteKey;
  locale: LocaleCode;
  messages: Messages;
  /** 404 must be indexable-never; every real page must be indexable-always. */
  noindex?: boolean;
  /**
   * The locales actually published. MUST be the shipped set, not the declared
   * one: an hreflang pointing at a locale that has no page is a cluster of 404s,
   * which Google reports as an error and which can sink the whole cluster.
   */
  locales?: readonly Locale[];
}

/** The full <head> inner HTML for a page, minus the build's own asset tags. */
export function buildHead({
  key,
  locale,
  messages,
  noindex = false,
  locales = LOCALES,
}: HeadOptions): string {
  const meta = metaFor(key, messages);
  const loc = getLocale(locale);
  const canonical = urlFor(key, locale);
  const alts = alternatesFor(key, locales);

  const lines: string[] = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    noindex
      ? `<meta name="robots" content="noindex, follow" />`
      : `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta name="application-name" content="YappyKit" />`,
  ];

  // hreflang. Reciprocal by construction — every alternate set is generated from
  // the same table, so each page in the set lists the identical set of URLs.
  for (const a of alts) {
    lines.push(`<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`);
  }

  lines.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="YappyKit" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${loc.ogLocale}" />`,
  );
  if (alts.length) {
    for (const l of locales) {
      if (l.code === locale) continue;
      lines.push(`<meta property="og:locale:alternate" content="${l.ogLocale}" />`);
    }
  }

  lines.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  );

  for (const block of structuredData(key, locale, messages)) {
    lines.push(`<script type="application/ld+json">${jsonLd(block)}</script>`);
  }

  return lines.join('\n    ');
}

/** `<html>` attributes for a locale — language and writing direction. */
export function htmlAttrs(locale: LocaleCode): string {
  const loc = getLocale(locale);
  return `lang="${loc.code}" dir="${loc.dir}"`;
}

export { pathFor };
