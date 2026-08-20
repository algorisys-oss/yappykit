import { describe, it, expect } from 'vitest';
import { buildBody } from './body';
import { LOCALES } from '../i18n/locales';
import { TOOL_KEYS } from '../i18n/routes';
import { ARTICLES } from '../content/articles';
import { esc } from './head';
import en from '../i18n/messages/en';
import es from '../i18n/messages/es';

const shipped = LOCALES.filter((l) => l.code === 'en' || l.code === 'es');

/**
 * The technical article is docs/06's "differentiating asset", and it only
 * counts if it is in the static page: an AdSense reviewer and a crawler both
 * read the HTML, and the whole reason for the article is to be the thing that
 * makes a tool page more than a widget.
 */
describe('the per-tool technical article', () => {
  it('exists for every tool that ships', () => {
    const missing = TOOL_KEYS.filter((k) => !ARTICLES[k]);
    expect(missing, 'every tool page needs its article').toEqual([]);
  });

  it('is substantial rather than a token paragraph', () => {
    for (const key of TOOL_KEYS) {
      const article = ARTICLES[key]!;
      expect(article.paragraphs.length, `${key} is too short`).toBeGreaterThanOrEqual(4);
      const words = article.paragraphs.join(' ').split(/\s+/).length;
      expect(words, `${key} has only ${words} words`).toBeGreaterThan(300);
    }
  });

  it('gives each tool its own article, not a template', () => {
    const headings = TOOL_KEYS.map((k) => ARTICLES[k]!.heading);
    expect(new Set(headings).size).toBe(headings.length);
    const openings = TOOL_KEYS.map((k) => ARTICLES[k]!.paragraphs[0]!.slice(0, 40));
    expect(new Set(openings).size).toBe(openings.length);
  });

  it('reaches the prerendered English page', () => {
    for (const key of TOOL_KEYS) {
      const html = buildBody({ key, locale: 'en', messages: en, locales: shipped });
      expect(html, `${key} article missing from the static page`).toContain(
        esc(ARTICLES[key]!.heading),
      );
    }
  });

  it('does not appear on a translated page in the wrong language', () => {
    const html = buildBody({ key: 'image-compress', locale: 'es', messages: es, locales: shipped });
    expect(html).not.toContain(esc(ARTICLES['image-compress']!.heading));
    expect(html).not.toContain('<article>');
  });

  it('avoids the em-dash the rest of the site avoids', () => {
    for (const key of TOOL_KEYS) {
      const text = ARTICLES[key]!.heading + ' ' + ARTICLES[key]!.paragraphs.join(' ');
      expect(text, `${key} uses an em dash`).not.toContain('—');
    }
  });
});
