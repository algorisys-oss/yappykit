/**
 * Writes the static HTML for every route × shipped locale, plus the sitemap and
 * the 404 page.
 *
 * Output uses the FLAT form (`/compress-image-to-size.html`), not the
 * directory-index form, and that choice is load-bearing for SEO.
 *
 * Canonical URLs, hreflang alternates and the sitemap are all emitted WITHOUT a
 * trailing slash. Cloudflare Pages resolves `/foo` against `foo.html` first and
 * serves it directly, but when only `foo/index.html` exists it answers `/foo`
 * with a 308 to `/foo/`. Under the directory form every canonical URL we publish
 * therefore redirects, so the sitemap advertises 170 URLs that are all one hop
 * from the page, and each hreflang alternate points at a redirect — which Google
 * explicitly advises against.
 *
 * The trade-off is that the flat form is less portable: plain S3 and stock nginx
 * need a rewrite rule to map `/foo` to `foo.html`, whereas the directory form
 * needs none. Cloudflare Pages is the host (docs/05), it prefers the flat form,
 * and scripts/serve-dist.mjs reproduces that resolution order so the test suite
 * sees what actually ships.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCALES, DEFAULT_LOCALE, type LocaleCode } from '../i18n/locales';
import {
  allPaths,
  alternatesFor,
  urlFor,
  pathFor,
  redirects,
  ROUTES,
  SITE,
  TOOL_KEYS,
  TOOL_CATEGORY,
  CATEGORIES,
  categoryRouteKey,
  type RouteKey,
} from '../i18n/routes';
import { MESSAGES, SHIPPED_LOCALES, messagesFor } from '../i18n/all-messages';
import { buildHead, htmlAttrs, esc } from './head';
import { buildBody } from './body';

const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
const BODY_SLOT = '<!--app:body-->';
const HTML_TAG = /<html\b[^>]*>/;

/** Splice a generated head and body into the built template. */
export function composePage(
  template: string,
  opts: { key: RouteKey | 'not-found'; locale: LocaleCode; noindex?: boolean },
): string {
  const messages = messagesFor(opts.locale);
  const headKey: RouteKey = opts.key === 'not-found' ? 'home' : opts.key;

  const head = buildHead({
    key: headKey,
    locale: opts.locale,
    messages,
    noindex: opts.noindex ?? opts.key === 'not-found',
    locales: SHIPPED_LOCALES,
  });
  const body = buildBody({
    key: opts.key,
    locale: opts.locale,
    messages,
    locales: SHIPPED_LOCALES,
  });

  let out = template;
  if (!SEO_BLOCK.test(out)) throw new Error('index.html is missing the <!--seo:start--> block');
  if (!out.includes(BODY_SLOT)) throw new Error('index.html is missing the <!--app:body--> slot');

  out = out.replace(SEO_BLOCK, head);
  out = out.replace(BODY_SLOT, body);
  out = out.replace(HTML_TAG, `<html ${htmlAttrs(opts.locale)}>`);
  return out;
}

/**
 * Where a URL path is written on disk.
 *
 * `/de/zufallswortgenerator` becomes `de/zufallswortgenerator.html`, which the
 * host serves at the slash-free canonical URL. The locale root `/de` becomes
 * `de.html` and sits happily beside the `de/` directory.
 */
export function fileForPath(p: string): string {
  const clean = p.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}.html` : 'index.html';
}

/**
 * A sitemap carrying xhtml:link alternates. Google reads the language cluster
 * from here as well as from the page head; having both agree is what stops it
 * picking one locale and dropping the rest.
 */
export function buildSitemap(lastmod: string): string {
  const rows = allPaths(SHIPPED_LOCALES)
    .map(({ key, locale }) => {
      const alts = alternatesFor(key, SHIPPED_LOCALES)
        .map(
          (a) =>
            `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`,
        )
        .join('\n');
      const priority = key === 'home' ? '1.0' : ROUTES[key].localized ? '0.9' : '0.3';
      const freq = key === 'privacy' ? 'yearly' : key === 'home' ? 'weekly' : 'monthly';
      return [
        '  <url>',
        `    <loc>${esc(urlFor(key, locale))}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${freq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        alts,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${rows}
</urlset>
`;
}

/**
 * Cloudflare Pages `_headers`.
 *
 * Generated rather than hand-written because the isolated video route now has a
 * different URL in every locale: a hand-maintained list would silently stop
 * matching the day a slug changed, and the failure — losing SharedArrayBuffer,
 * so ffmpeg drops to single-threaded — is invisible until someone times a
 * compression.
 */
export function buildHeaders(): string {
  // Every route that needs SharedArrayBuffer. Kept here rather than hand-written
  // into _headers: each tool has a different URL in all twelve locales, and a
  // stale list fails silently — ffmpeg quietly drops to single-threaded, and the
  // PDF password tool hangs outright.
  const isolatedTools = ['video-compress', 'pdf-password'] as const;
  const isolated = isolatedTools
    .flatMap((tool) => SHIPPED_LOCALES.map((l) => pathFor(tool, l.code)))
    .map(
      (p) =>
        `${p}\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp`,
    )
    .join('\n');

  return `# GENERATED by scripts/prerender.mjs. Edit src/prerender/render.ts, not this file.
#
# COOP/COEP (cross-origin isolation) unlocks SharedArrayBuffer, which the
# multithreaded ffmpeg.wasm wants and qpdf-wasm cannot run without. It breaks
# AdSense, so ONLY the routes needing it are isolated and those pages carry no
# ad script; every other route stays unisolated and monetized.
# Validated locally: spike/coop-coep/FINDINGS.md and spike/qpdf-encrypt/FINDINGS.md.
# ffmpeg can fall back to a single-threaded core. qpdf cannot: its only build
# imports shared memory, and without isolation it hangs rather than failing.
${isolated}

# Hashed assets: long cache. CORP+COEP so the isolated route can embed them:
# the ffmpeg WORKER script and .wasm binary need BOTH (a dedicated worker in an
# isolated page must itself be require-corp; the spike proved CORP alone fails).
# Harmless on unisolated routes.
/assets/*
  Cache-Control: public, max-age=31536000, immutable
  Cross-Origin-Resource-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

# Prerendered HTML is NOT content-hashed; its URL is the page's URL. Caching it
# like an asset would pin visitors to a stale copy of the page, and a stale
# canonical, until the CDN expired it. Revalidate every time; these responses are
# a few KB and 304s cost nothing.
/*
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/sitemap.xml
  Cache-Control: public, max-age=3600
/robots.txt
  Cache-Control: public, max-age=3600
`;
}

/**
 * Cloudflare Pages `_redirects`.
 *
 * Generated from the retired-slug table in i18n/routes for the same reason
 * `_headers` is generated: a hand-kept list of old URLs stops matching the day
 * a slug moves, and the failure is a 404 on a page that used to work, which
 * nobody notices because nobody is looking at the URL they no longer link to.
 */
export function buildRedirects(): string {
  const rows = redirects(SHIPPED_LOCALES)
    .map((r) => `${r.from} ${r.to} 301`)
    .join('\n');

  return `# GENERATED by scripts/prerender.mjs. Edit src/i18n/routes.ts, not this file.
#
# Permanent redirects from slugs we have retired. 301 rather than 302 so the
# ranking signal follows the page to its new URL instead of being split.
${rows}
`;
}

export function buildRobots(): string {
  return `User-agent: *
Allow: /

# The 404 page is noindex, but keep crawlers out of it entirely.
Disallow: /404.html

Sitemap: ${SITE}/sitemap.xml
`;
}

/**
 * /llms.txt, in the format proposed at llmstxt.org.
 *
 * Generated from the same catalogue as the sitemap, so it cannot list a tool
 * that does not exist or miss one that does. That is the only reason it is
 * worth having as a file rather than as a hand-written page: a stale map of the
 * site is worse than none.
 *
 * English only, like the articles and the release notes. These are precise
 * statements about what each tool does, and a machine-translated approximation
 * of a precise statement is a wrong statement.
 *
 * Worth being honest in the code about what this is: no major crawler has
 * confirmed it reads llms.txt, and Google has said publicly that it does not.
 * It costs almost nothing and may help; it is not a substitute for the JSON-LD
 * on every tool page, which answer engines demonstrably do consume.
 */
export function buildLlms(): string {
  const m = MESSAGES[DEFAULT_LOCALE]!;
  const heading: Record<string, string> = {
    image: 'Images and photos',
    pdf: 'PDFs',
    video: 'Video and audio',
    data: 'Spreadsheets and data',
    text: 'Text and fonts',
    device: 'Device checks',
  };

  const sections = CATEGORIES.map((category) => {
    const keys = TOOL_KEYS.filter((k) => TOOL_CATEGORY[k] === category);
    if (!keys.length) return '';
    const rows = keys
      .map((k) => `- [${m.tools[k].title}](${SITE}${pathFor(k, DEFAULT_LOCALE)}): ${m.tools[k].blurb}`)
      .join('\n');
    const hub = `${SITE}${pathFor(categoryRouteKey(category), DEFAULT_LOCALE)}`;
    return `## ${heading[category] ?? category}\n\nAll of these on one page: ${hub}\n\n${rows}\n`;
  })
    .filter(Boolean)
    .join('\n');

  return `# YappyKit

> Free, private tools for files and data. Every tool runs entirely inside the
> browser: nothing is uploaded, there is no account, and no server ever sees the
> file. ${TOOL_KEYS.length} tools, in 12 languages.

How it works, because it is the only thing that distinguishes this site: the
work is done by the visitor's own device, using WebAssembly and web workers.
A file chosen here is read by the page and never sent anywhere, which can be
checked by watching the browser's network tab while a tool runs. That is also
the limit of the design, and it is stated on each tool rather than hidden: what
a phone cannot do, the page says it cannot do.

Tools ask for the result wanted rather than the settings to reach it. "Under
100 KB" is the control; quality percentages are not.

${sections}
## About

- [About](${SITE}${pathFor('about', DEFAULT_LOCALE)}): who makes this and why it has no accounts.
- [Privacy Policy](${SITE}${pathFor('privacy', DEFAULT_LOCALE)}): what is not collected.
- [Terms of Use](${SITE}${pathFor('terms', DEFAULT_LOCALE)}): the terms.
- [Source code](https://github.com/algorisys-oss/yappykit): the whole site, open source.
`;
}

export interface RenderReport {
  pages: number;
  locales: LocaleCode[];
  missing: LocaleCode[];
}

/** Generate everything into `dist`. Returns a report for the build log. */
export async function renderAll(dist: string, lastmod: string): Promise<RenderReport> {
  const templatePath = path.join(dist, 'index.html');
  const template = await readFile(templatePath, 'utf8');

  const targets = allPaths(SHIPPED_LOCALES);
  for (const { key, locale, path: urlPath } of targets) {
    const html = composePage(template, { key, locale });
    const file = path.join(dist, fileForPath(urlPath));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html, 'utf8');
  }

  // 404: real status comes from the host serving /404.html; the noindex meta is
  // what stops a soft-404 from being indexed if it is ever reached directly.
  await writeFile(
    path.join(dist, '404.html'),
    composePage(template, { key: 'not-found', locale: DEFAULT_LOCALE, noindex: true }),
    'utf8',
  );

  await writeFile(path.join(dist, 'sitemap.xml'), buildSitemap(lastmod), 'utf8');
  await writeFile(path.join(dist, 'robots.txt'), buildRobots(), 'utf8');
  await writeFile(path.join(dist, 'llms.txt'), buildLlms(), 'utf8');
  await writeFile(path.join(dist, '_headers'), buildHeaders(), 'utf8');
  await writeFile(path.join(dist, '_redirects'), buildRedirects(), 'utf8');

  return {
    pages: targets.length + 1,
    locales: SHIPPED_LOCALES.map((l) => l.code),
    // Declared in the locale table but not yet translated. Reported so a
    // half-finished locale is visible in the build log rather than silently
    // absent from the sitemap.
    missing: LOCALES.filter((l) => !MESSAGES[l.code]).map((l) => l.code),
  };
}
