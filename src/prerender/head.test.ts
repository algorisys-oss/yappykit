import { describe, it, expect } from 'vitest';
import { buildHead, structuredData, metaFor, esc, jsonLd, htmlAttrs } from './head';
import { LOCALES } from '../i18n/locales';
import { ROUTE_KEYS, ROUTES, TOOL_KEYS, urlFor } from '../i18n/routes';
import en from '../i18n/messages/en';

const M = en;

describe('the canonical bug this module exists to fix', () => {
  it('never points a tool page at the home page', () => {
    const head = buildHead({ key: 'image-compress', locale: 'en', messages: M });
    expect(head).toContain('<link rel="canonical" href="https://yappykit.com/compress-image-to-size" />');
    expect(head).not.toContain('<link rel="canonical" href="https://yappykit.com/" />');
  });

  it('gives every route in every locale its own self-referential canonical', () => {
    for (const key of ROUTE_KEYS) {
      for (const l of LOCALES) {
        if (!ROUTES[key].localized && l.code !== 'en') continue;
        const head = buildHead({ key, locale: l.code, messages: M });
        expect(head, `${key}@${l.code}`).toContain(
          `<link rel="canonical" href="${urlFor(key, l.code)}" />`,
        );
      }
    }
  });

  it('gives every route a distinct title', () => {
    const titles = ROUTE_KEYS.map((k) => metaFor(k, M).title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('hreflang', () => {
  it('lists every locale plus x-default, including the page itself', () => {
    const head = buildHead({ key: 'passport-photo', locale: 'de', messages: M });
    for (const l of LOCALES) {
      expect(head).toContain(`hreflang="${l.code}" href="${urlFor('passport-photo', l.code)}"`);
    }
    expect(head).toContain('hreflang="x-default" href="https://yappykit.com/passport-photo"');
    // Self-reference is mandatory for Google to accept the cluster.
    expect(head).toContain(`hreflang="de" href="${urlFor('passport-photo', 'de')}"`);
  });

  it('is byte-identical across the locales of one route, which is what makes it reciprocal', () => {
    const only = (h: string) => h.split('\n').filter((l) => l.includes('rel="alternate"')).sort().join('\n');
    const a = only(buildHead({ key: 'document-scan', locale: 'en', messages: M }));
    const b = only(buildHead({ key: 'document-scan', locale: 'ja', messages: M }));
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('emits none for the deliberately single-locale privacy page', () => {
    const head = buildHead({ key: 'privacy', locale: 'en', messages: M });
    expect(head).not.toContain('rel="alternate"');
    expect(head).not.toContain('og:locale:alternate');
  });
});

describe('robots', () => {
  it('marks real pages indexable', () => {
    expect(buildHead({ key: 'home', locale: 'en', messages: M })).toContain(
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
    );
  });

  it('marks the 404 noindex, so soft-404s cannot enter the index', () => {
    const head = buildHead({ key: 'home', locale: 'en', messages: M, noindex: true });
    expect(head).toContain('<meta name="robots" content="noindex, follow" />');
    expect(head).not.toContain('content="index, follow');
  });
});

describe('structured data', () => {
  it('gives a tool page the four rich-result types', () => {
    const types = structuredData('image-compress', 'en', M).map((d: any) => d['@type']);
    expect(types).toEqual(
      expect.arrayContaining(['BreadcrumbList', 'SoftwareApplication', 'FAQPage', 'HowTo']),
    );
  });

  it('fills FAQPage from the same messages the visible FAQ renders', () => {
    const faq: any = structuredData('image-compress', 'en', M).find((d: any) => d['@type'] === 'FAQPage');
    expect(faq.mainEntity).toHaveLength(M.tools['image-compress'].content.faqs.length);
    expect(faq.mainEntity[0].name).toBe(M.tools['image-compress'].content.faqs[0]!.q);
  });

  it('numbers HowTo steps from 1', () => {
    const how: any = structuredData('document-scan', 'en', M).find((d: any) => d['@type'] === 'HowTo');
    expect(how.step.map((s: any) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it('lists every tool on the home page', () => {
    const list: any = structuredData('home', 'en', M).find((d: any) => d['@type'] === 'ItemList');
    expect(list.itemListElement).toHaveLength(TOOL_KEYS.length);
    expect(list.itemListElement.map((i: any) => i.position)).toEqual(
      TOOL_KEYS.map((_, i) => i + 1),
    );
  });

  it('declares the page language so translated pages are not read as English', () => {
    const site: any = structuredData('home', 'ru', M).find((d: any) => d['@type'] === 'WebSite');
    expect(site.inLanguage).toBe('ru');
  });
});

describe('escaping', () => {
  it('escapes quotes so a title cannot break out of an attribute', () => {
    expect(esc('a "b" & <c>')).toBe('a &quot;b&quot; &amp; &lt;c&gt;');
  });

  it('escapes < in JSON-LD so a string cannot close the script element', () => {
    expect(jsonLd({ a: '</script><img onerror=x>' })).not.toContain('</script>');
    expect(jsonLd({ a: '</script>' })).toContain('\\u003c');
  });

  it('produces JSON-LD that still parses after escaping', () => {
    expect(JSON.parse(jsonLd({ a: '</script>' }))).toEqual({ a: '</script>' });
  });
});

describe('html attributes', () => {
  it('sets lang and ltr for English', () => {
    expect(htmlAttrs('en')).toBe('lang="en" dir="ltr"');
  });

  it('sets rtl for Arabic', () => {
    expect(htmlAttrs('ar')).toBe('lang="ar" dir="rtl"');
  });
});

describe('hreflang never advertises an unpublished locale', () => {
  const shipped = LOCALES.filter((l) => l.code === 'en' || l.code === 'es');

  it('lists only the locales passed in', () => {
    const head = buildHead({ key: 'mouse-test', locale: 'en', messages: M, locales: shipped });
    expect(head).toContain('hreflang="en"');
    expect(head).toContain('hreflang="es"');
    for (const l of LOCALES) {
      if (l.code === 'en' || l.code === 'es') continue;
      expect(head, `${l.code} must not be advertised`).not.toContain(`hreflang="${l.code}"`);
    }
  });

  it('restricts og:locale:alternate to published locales too', () => {
    const head = buildHead({ key: 'mouse-test', locale: 'en', messages: M, locales: shipped });
    expect(head).toContain('og:locale:alternate" content="es_ES"');
    expect(head).not.toContain('og:locale:alternate" content="ja_JP"');
  });
});
