import { describe, it, expect } from 'vitest';
import { buildBody } from './body';
import { LOCALES } from '../i18n/locales';
import { TOOL_KEYS } from '../i18n/routes';
import en from '../i18n/messages/en';
import de from '../i18n/messages/de';

const shipped = LOCALES.filter((l) => l.code === 'en' || l.code === 'de');

/**
 * The landing page states how many tools there are.
 *
 * A number typed into the copy is right on the day it is written and wrong the
 * next time a tool ships, and nobody notices because nothing fails. So it is
 * counted from the route table, and this is the test that stops anyone quietly
 * replacing the count with a literal.
 */
describe('the tool count on the landing page', () => {
  const home = (locale: 'en' | 'de') =>
    buildBody({ key: 'home', locale, messages: locale === 'en' ? en : de, locales: shipped });

  it('states the number of tools that actually exist', () => {
    expect(home('en')).toContain(`${TOOL_KEYS.length} tools`);
  });

  it('counts the same tools it renders cards for', () => {
    const html = home('en');
    // Every card links to a tool page and carries its title; counting the grid
    // is what makes the number above it verifiable rather than decorative.
    const cards = (html.match(/class="[^"]*flex flex-col[^"]*rounded/g) ?? []).length;
    expect(cards).toBe(TOOL_KEYS.length);
  });

  it('reads the count in the visitor’s language, not just English', () => {
    expect(home('de')).toContain(`${TOOL_KEYS.length} Werkzeuge`);
  });

  it('never renders an unsubstituted token', () => {
    for (const locale of ['en', 'de'] as const) {
      expect(home(locale), locale).not.toContain('{n}');
    }
  });
});
