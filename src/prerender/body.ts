/**
 * Builds the static HTML body for one prerendered page.
 *
 * This is NOT server-side rendering of the Solid components: the tool routes
 * import browser-only code (Canvas, WASM, the zen-ui build), so they cannot be
 * evaluated in Node. Instead the same message data that feeds the components
 * feeds a plain string emitter here. The wording therefore cannot drift between
 * the prerendered page and the rendered one — only the markup can, and the
 * markup is not what gets indexed.
 *
 * The SPA clears #root and takes over on mount (see src/index.tsx), so this
 * content is what a crawler, a no-JS visitor, and every visitor during the
 * moment before the bundle executes actually see.
 *
 * Utility classes used here are picked up by UnoCSS via the `content.filesystem`
 * entry in uno.config.ts.
 */
import { getLocale, type Locale, type LocaleCode } from '../i18n/locales';
import { TOOL_KEYS, pathFor, relatedTools, type RouteKey, type ToolKey } from '../i18n/routes';
import { parts } from '../i18n/format';
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '../content/terms';
import type { Messages } from '../i18n/messages/en';
import { esc } from './head';

const YAPPYDRAW = 'https://yappydraw.com';

/** Render a template whose {tokens} map to HTML fragments, in translator order. */
function tpl(template: string, map: Record<string, string>): string {
  return parts(template)
    .map((p) => ('text' in p ? esc(p.text) : (map[p.token] ?? `{${p.token}}`)))
    .join('');
}

function header(locale: LocaleCode, m: Messages): string {
  return `<header class="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
  <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
    <a href="${pathFor('home', locale)}" class="flex items-center gap-2 no-underline">
      <span class="text-lg font-bold text-fg">YappyKit</span>
      <span class="hidden text-xs text-muted lg:inline">${esc(m.common.tagline)}</span>
    </a>
    <div class="ms-auto flex items-center gap-2">
      <span class="hidden rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted lg:inline-block">${esc(m.common.headerNoUploads)}</span>
    </div>
  </div>
</header>`;
}

/**
 * The footer carries the site-wide policy links AND a real <a> to every locale.
 * Those links are how a crawler discovers the translated pages in the first
 * place — hreflang alone is a hint, not a crawl path.
 */
function footer(key: RouteKey, locale: LocaleCode, m: Messages, locales: readonly Locale[]): string {
  const note = tpl(m.common.footerNote, {
    privacy: `<a href="/privacy" class="underline hover:text-accent">${esc(m.common.footerPrivacyLink)}</a>`,
  });
  // Must mirror src/components/Footer.tsx: this is the copy a crawler and a
  // visitor without JavaScript actually see.
  const heart =
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="inline-block text-danger" role="img" aria-label="${esc(m.common.footerHeart)}">` +
    '<path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6.5 5.4 5.4 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z" /></svg>';
  const madeBy = tpl(m.common.footerMadeBy, {
    heart,
    company:
      '<a href="https://www.algorisys.com" rel="external noopener" target="_blank" class="text-muted underline hover:text-accent">Algorisys Technologies</a>',
  });
  const langs = locales.map((l) => {
    const href = pathFor(key, l.code);
    const current = l.code === locale;
    return `<li><a href="${href}" hreflang="${l.code}" lang="${l.code}" rel="external"${current ? ' aria-current="true"' : ''} class="text-muted no-underline hover:text-accent${current ? ' font-semibold text-fg' : ''}">${esc(l.name)}</a></li>`;
  }).join('');

  return `<footer class="border-t border-border">
  <div class="mx-auto max-w-4xl px-6 py-8">
    <nav class="mb-3 flex gap-4 text-sm" aria-label="${esc(m.common.footerNav)}">
      <a href="${pathFor('home', locale)}" class="text-muted no-underline hover:text-accent">${esc(m.common.footerHome)}</a>
      <a href="${pathFor('about', locale)}" class="text-muted no-underline hover:text-accent">${esc(m.common.footerAbout)}</a>
      <a href="/privacy" class="text-muted no-underline hover:text-accent">${esc(m.common.footerPrivacy)}</a>
      <a href="/terms" class="text-muted no-underline hover:text-accent">${esc(m.common.footerTerms)}</a>
    </nav>
    <nav aria-label="${esc(m.common.languageLabel)}" class="mb-4">
      <ul class="flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">${langs}</ul>
    </nav>
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
      <p class="m-0 flex items-center gap-1">${madeBy}</p>
      <a href="https://github.com/algorisys-oss/yappykit" rel="external noopener" target="_blank" class="inline-flex items-center gap-1 text-muted no-underline hover:text-accent">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" /></svg>
        ${esc(m.common.footerStar)}
      </a>
    </div>
    <p class="max-w-2xl text-xs text-muted">${note}</p>
  </div>
</footer>`;
}

function toolCard(k: ToolKey, locale: LocaleCode, m: Messages): string {
  const t = m.tools[k];
  return `<a href="${pathFor(k, locale)}" class="group relative flex flex-col rounded-lg border p-5 no-underline transition-all duration-150 cursor-pointer overflow-hidden border-border bg-surface shadow-sm hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
      <span class="font-semibold text-fg">${esc(t.title)}</span>
      <span class="mt-1 text-sm text-muted">${esc(t.blurb)}</span>
    </a>`;
}

function landing(locale: LocaleCode, m: Messages): string {
  const l = m.landing;
  const claims = l.claims
    .map((c) => `<li class="rounded-full border border-border bg-surface px-3 py-1 text-muted">✓ ${esc(c)}</li>`)
    .join('');
  const props = l.valueProps
    .map(
      (v) => `<div class="rounded-lg border border-border bg-surface p-5">
        <h3 class="mt-3 font-semibold text-fg">${esc(v.title)}</h3>
        <p class="mt-1 text-sm text-muted">${esc(v.body)}</p>
      </div>`,
    )
    .join('');
  const steps = l.howSteps
    .map(
      (s, i) => `<li>
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg">${i + 1}</div>
        <h3 class="mt-3 font-semibold text-fg">${esc(s.t)}</h3>
        <p class="mt-1 text-sm text-muted">${esc(s.d)}</p>
      </li>`,
    )
    .join('');
  const howSub = tpl(l.howSub, {
    file: `<strong class="text-fg">${esc(l.howSubFile)}</strong>`,
    page: `<strong class="text-fg">${esc(l.howSubPage)}</strong>`,
  });
  const sisterFeatures = l.sisterFeatures.map((f) => `<li>${esc(f)}</li>`).join('');

  return `<main>
  <section class="relative overflow-hidden border-b border-border">
    <div class="relative mx-auto max-w-4xl px-6 py-20 sm:py-28">
      <p class="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">${esc(l.badge)}</p>
      <h1 class="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">${esc(l.h1)}</h1>
      <p class="mt-5 max-w-2xl text-lg text-muted sm:text-xl">${esc(l.sub)}</p>
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <a href="${pathFor(TOOL_KEYS[0]!, locale)}" class="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg no-underline shadow-sm transition hover:opacity-90">${esc(l.ctaOpen)}</a>
        <a href="#how" class="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-fg no-underline transition hover:border-accent">${esc(l.ctaHow)}</a>
      </div>
      <ul class="mt-8 flex list-none flex-wrap gap-2 p-0 text-sm">${claims}</ul>
    </div>
  </section>

  <section aria-labelledby="why" class="mx-auto max-w-4xl px-6 py-16">
    <h2 id="why" class="sr-only">${esc(l.whyHeading)}</h2>
    <div class="grid gap-6 sm:grid-cols-3">${props}</div>
  </section>

  <section aria-labelledby="tools" class="mx-auto max-w-4xl px-6 pb-16">
    <h2 id="tools" class="text-2xl font-bold">${esc(l.toolsHeading)}</h2>
    <p class="mt-1 text-muted">${esc(l.toolsSub)}</p>
    <div class="mt-6 grid gap-4 sm:grid-cols-2">${TOOL_KEYS.map((k) => toolCard(k, locale, m)).join('')}</div>
  </section>

  <section id="how" class="border-t border-border bg-surface/50">
    <div class="mx-auto max-w-4xl px-6 py-16">
      <h2 class="text-2xl font-bold">${esc(l.howHeading)}</h2>
      <p class="mt-1 max-w-2xl text-muted">${howSub}</p>
      <ol class="mt-8 grid list-none gap-6 p-0 sm:grid-cols-3">${steps}</ol>
      <div class="mt-8 border-s-2 border-accent ps-4">
        <p class="max-w-2xl text-sm text-fg"><strong>${esc(l.checkLabel)}</strong> ${esc(l.checkBody)}</p>
      </div>
    </div>
  </section>

  <section class="border-t border-border">
    <div class="mx-auto max-w-4xl px-6 py-16">
      <h2 class="text-2xl font-bold">${esc(l.sisterHeading)}</h2>
      <p class="mt-2 max-w-2xl text-muted">${esc(l.sisterBody)}</p>
      <ul class="mt-4 max-w-2xl list-disc space-y-1 ps-5 text-sm text-muted">${sisterFeatures}</ul>
      <a href="${YAPPYDRAW}" target="_blank" rel="noopener" class="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-fg no-underline transition hover:border-accent">
        ${esc(l.sisterCta)} <span aria-hidden="true">↗</span><span class="sr-only">${esc(l.sisterNewWindow)}</span>
      </a>
    </div>
  </section>
</main>`;
}

function toolPage(key: ToolKey, locale: LocaleCode, m: Messages): string {
  const t = m.tools[key];
  const c = t.content;
  const related = relatedTools(key);

  return `<main class="mx-auto max-w-2xl px-6 py-12">
  <header class="flex items-start gap-5">
    <div>
      <h1 class="text-2xl font-bold">${esc(t.heroTitle)}</h1>
      <p class="mt-2 max-w-prose text-sm text-muted">${esc(t.heroNote)}</p>
    </div>
  </header>

  <div class="mt-8 min-h-[16rem] rounded-lg border border-dashed border-border p-6">
    <noscript><p class="text-sm text-muted">${esc(t.heroNote)}</p></noscript>
  </div>

  <section class="mt-16 space-y-10 border-t border-border pt-10">
    <div>
      <h2 class="text-xl font-bold">${esc(m.content.howItWorksHeading)}</h2>
      <div class="mt-3 space-y-3 text-sm leading-relaxed text-fg">
        ${c.howItWorks.map((p) => `<p class="max-w-prose">${esc(p)}</p>`).join('')}
      </div>
    </div>

    <div>
      <h2 class="text-xl font-bold">${esc(m.content.howToUseHeading)}</h2>
      <ol class="mt-3 max-w-prose list-none space-y-3 p-0">
        ${c.steps
          .map(
            (s, i) => `<li class="flex gap-3 text-sm text-fg">
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">${i + 1}</span>
          <span class="leading-relaxed">${esc(s)}</span>
        </li>`,
          )
          .join('')}
      </ol>
    </div>

    <div>
      <h2 class="text-xl font-bold">${esc(m.content.goodToKnowHeading)}</h2>
      <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5 text-sm leading-relaxed text-fg">
        ${c.tips.map((t2) => `<li>${esc(t2)}</li>`).join('')}
      </ul>
    </div>

    <div>
      <h2 class="text-xl font-bold">${esc(m.content.faqHeading)}</h2>
      <div class="mt-3">
        ${c.faqs
          .map(
            (f) => `<details class="border-b border-border py-3">
          <summary class="cursor-pointer text-sm font-medium text-fg">${esc(f.q)}</summary>
          <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">${esc(f.a)}</p>
        </details>`,
          )
          .join('')}
      </div>
    </div>

    <div>
      <h2 class="text-xl font-bold">${esc(m.content.relatedHeading)}</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        ${related
          .map(
            (k) => `<a href="${pathFor(k, locale)}" class="flex flex-col rounded-lg border border-border bg-surface p-4 no-underline transition hover:border-accent">
          <span class="text-sm font-semibold text-fg">${esc(m.tools[k].title)}</span>
          <span class="mt-1 text-xs text-muted">${esc(m.tools[k].blurb)}</span>
        </a>`,
          )
          .join('')}
      </div>
    </div>

    <p class="text-xs text-muted">${esc(m.content.verifyNote)}</p>
  </section>
</main>`;
}

function about(locale: LocaleCode, m: Messages): string {
  const a = m.about;
  const how1 = tpl(a.howBody1, {
    file: `<strong>${esc(a.howBody1File)}</strong>`,
    page: `<strong>${esc(a.howBody1Page)}</strong>`,
  });
  const outro = tpl(a.outro, {
    privacy: `<a href="/privacy" class="text-accent underline">${esc(a.outroPrivacy)}</a>`,
    browse: `<a href="${pathFor('home', locale)}" class="text-accent underline">${esc(a.outroBrowse)}</a>`,
  });
  return `<main class="mx-auto max-w-2xl px-6 py-12">
  <h1 class="text-3xl font-bold">${esc(a.h1)}</h1>
  <p class="mt-4 max-w-prose text-lg text-muted">${esc(a.intro)}</p>
  <div class="mt-10 space-y-10 text-sm leading-relaxed text-fg">
    <section>
      <h2 class="text-xl font-bold">${esc(a.whyHeading)}</h2>
      <p class="mt-3 max-w-prose">${esc(a.whyBody1)}</p>
      <p class="mt-3 max-w-prose">${esc(a.whyBody2)}</p>
    </section>
    <section>
      <h2 class="text-xl font-bold">${esc(a.howHeading)}</h2>
      <p class="mt-3 max-w-prose">${how1}</p>
      <p class="mt-3 max-w-prose">${esc(a.howBody2)}</p>
    </section>
    <section>
      <h2 class="text-xl font-bold">${esc(a.isHeading)}</h2>
      <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5">${a.isPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </section>
    <section>
      <h2 class="text-xl font-bold">${esc(a.toolsHeading)}</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">${TOOL_KEYS.map((k) => toolCard(k, locale, m)).join('')}</div>
    </section>
    <p class="border-t border-border pt-6 text-muted">${outro}</p>
  </div>
</main>`;
}

/**
 * The Terms of Use, rendered in full.
 *
 * Unlike the other single-locale page, this one IS prerendered with its body: a
 * liability disclaimer that only appears once JavaScript has run is not much of
 * a disclaimer, and it must be readable by a crawler, an AdSense reviewer and a
 * visitor with scripts blocked alike.
 */
function terms(locale: LocaleCode): string {
  const sections = TERMS_SECTIONS.map((sec) => {
    const paras = sec.paragraphs.map((p) => `<p class="mt-2">${esc(p)}</p>`).join('');
    const bullets = sec.bullets
      ? `<ul class="mt-3 list-disc space-y-1 ps-5">${sec.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    return `<section id="${esc(sec.id)}">
      <h2 class="text-lg font-semibold">${esc(sec.heading)}</h2>
      ${paras}${bullets}
    </section>`;
  }).join('');

  return `<main class="mx-auto max-w-2xl px-6 py-12">
  <h1 class="text-3xl font-bold">Terms of Use</h1>
  <p class="mt-2 text-sm text-muted">Last updated: ${esc(TERMS_UPDATED)}</p>
  <div class="mt-8 space-y-8 text-sm leading-relaxed text-fg">
    <section><p>${esc(TERMS_INTRO)}</p></section>
    ${sections}
    <p class="border-t border-border pt-6 text-muted">
      See also our <a href="/privacy" class="text-accent underline">Privacy Policy</a>, or
      <a href="${pathFor('home', locale)}" class="text-accent underline">browse the tools</a>.
    </p>
  </div>
</main>`;
}

function notFound(locale: LocaleCode, m: Messages): string {
  return `<main class="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
  <p class="text-5xl font-bold text-accent">404</p>
  <h1 class="mt-4 text-2xl font-bold">${esc(m.notFound.h1)}</h1>
  <p class="mt-2 max-w-prose text-sm text-muted">${esc(m.notFound.body)}</p>
  <a href="${pathFor('home', locale)}" class="mt-8 inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg no-underline">${esc(m.notFound.cta)}</a>
</main>`;
}

export interface BodyOptions {
  key: RouteKey | 'not-found';
  locale: LocaleCode;
  messages: Messages;
  /**
   * The locales actually published. MUST be the shipped set: a switcher listing
   * a locale with no pages hands crawlers and readers a row of 404s.
   */
  locales: readonly Locale[];
}

/** The full contents of #root for a prerendered page. */
export function buildBody({ key, locale, messages, locales }: BodyOptions): string {
  let main: string;
  if (key === 'home') main = landing(locale, messages);
  else if (key === 'about') main = about(locale, messages);
  else if (key === 'not-found') main = notFound(locale, messages);
  else if (key === 'terms') main = terms(locale);
  else if (key === 'privacy') main = '';
  else main = toolPage(key as ToolKey, locale, messages);

  const footerKey: RouteKey =
    key === 'not-found' || key === 'privacy' || key === 'terms' ? 'home' : key;
  return [header(locale, messages), main, footer(footerKey, locale, messages, locales)]
    .filter(Boolean)
    .join('\n');
}

export { getLocale };
