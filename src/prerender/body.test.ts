import { describe, it, expect } from 'vitest';
import { buildBody } from './body';
import { LOCALES } from '../i18n/locales';
import { TOOL_KEYS, pathFor } from '../i18n/routes';
import en from '../i18n/messages/en';
import { PRIVACY_LEAD, PRIVACY_SECTIONS } from '../content/privacy';

const shipped = LOCALES.filter((l) => l.code === 'en' || l.code === 'es');

describe('the language switcher only offers pages that exist', () => {
  it('lists exactly the shipped locales, not every declared one', () => {
    const html = buildBody({ key: 'home', locale: 'en', messages: en, locales: shipped });
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="es"');
    for (const l of LOCALES) {
      if (l.code === 'en' || l.code === 'es') continue;
      expect(html, `${l.code} would 404`).not.toContain(`hreflang="${l.code}"`);
    }
  });

  it('points each language at the SAME page, not at the home page', () => {
    const html = buildBody({ key: 'passport-photo', locale: 'en', messages: en, locales: shipped });
    expect(html).toContain(`href="${pathFor('passport-photo', 'es')}"`);
  });
});

describe('prerendered body content', () => {
  it('carries the tool page h1, prose, steps and FAQ', () => {
    const t = en.tools['image-compress'];
    const html = buildBody({ key: 'image-compress', locale: 'en', messages: en, locales: shipped });
    expect(html).toContain(`<h1 class="text-2xl font-bold">${t.heroTitle}</h1>`);
    expect(html).toContain(t.content.howItWorks[0]!.slice(0, 40));
    expect(html).toContain(t.content.faqs[0]!.q);
    expect(html).toContain(en.content.faqHeading);
  });

  it('links every tool from the home page, so none is orphaned', () => {
    const html = buildBody({ key: 'home', locale: 'en', messages: en, locales: shipped });
    for (const k of TOOL_KEYS) expect(html, k).toContain(`href="${pathFor(k, 'en')}"`);
  });

  it('puts the policy links on a TOOL page, not just the home page', () => {
    const html = buildBody({ key: 'document-scan', locale: 'en', messages: en, locales: shipped });
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(`href="${pathFor('about', 'en')}"`);
  });

  it('escapes text rather than letting it become markup', () => {
    const evil = JSON.parse(JSON.stringify(en));
    evil.landing.h1 = '<script>alert(1)</script>';
    const html = buildBody({ key: 'home', locale: 'en', messages: evil, locales: shipped });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a link inside a translated sentence in the translator\'s word order', () => {
    const moved = JSON.parse(JSON.stringify(en));
    moved.common.footerNote = 'START {privacy} END';
    const html = buildBody({ key: 'home', locale: 'en', messages: moved, locales: shipped });
    expect(html).toMatch(/START <a href="\/privacy"[^>]*>.*?<\/a> END/);
  });
});

/**
 * The legal pages have to be in the STATIC html.
 *
 * The privacy policy shipped for a while as an empty body: the route rendered
 * it client-side, so it looked right in a browser and was invisible to anything
 * that does not run JavaScript. It is the page docs/07 names as a hard AdSense
 * requirement, which makes "renders eventually" the wrong bar.
 */
describe('the privacy policy is prerendered in full', () => {
  const html = () => buildBody({ key: 'privacy', locale: 'en', messages: en, locales: shipped });

  it('carries the exact claim we are allowed to make', () => {
    expect(html()).toContain(PRIVACY_LEAD.claim);
  });

  it('carries every section, not just the first', () => {
    for (const section of PRIVACY_SECTIONS) {
      expect(html(), `${section.id} is missing from the static page`).toContain(section.heading);
    }
  });

  it('renders the emphasis rather than leaking the asterisks', () => {
    expect(html()).toContain('<em>content</em>');
    expect(html()).not.toMatch(/\*[a-z]/);
  });

  it('renders the table that distinguishes your files from the page', () => {
    expect(html()).toContain('Leaves your device?');
    expect(html()).toContain('<table');
  });

  it('is substantially longer than its own chrome', () => {
    // A guard against silently regressing to an empty <main>.
    expect(html().length).toBeGreaterThan(6000);
  });
});
