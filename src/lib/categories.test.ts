import { describe, it, expect } from 'vitest';
import { categoryLinks, activeCategory } from './categories';
import { CATEGORIES, pathFor, categoryRouteKey, TOOL_CATEGORY } from '../i18n/routes';
import en from '../i18n/messages/en';

describe('categoryLinks', () => {
  it('links every category to its hub, in the active locale', () => {
    const links = categoryLinks(en, 'de');
    expect(links.map((l) => l.category)).toEqual([...CATEGORIES]);
    for (const link of links) {
      expect(link.href).toBe(pathFor(categoryRouteKey(link.category), 'de'));
      expect(link.label).not.toBe('');
    }
  });

  it('labels each one with the translated category name', () => {
    const byCategory = new Map(categoryLinks(en, 'en').map((l) => [l.category, l.label]));
    expect(byCategory.get('image')).toBe(en.landing.categoryImage);
    expect(byCategory.get('device')).toBe(en.landing.categoryDevice);
  });
});

describe('activeCategory', () => {
  it('highlights the hub you are on', () => {
    for (const c of CATEGORIES) {
      expect(activeCategory(pathFor(categoryRouteKey(c), 'en'))).toBe(c);
      expect(activeCategory(pathFor(categoryRouteKey(c), 'fr'))).toBe(c);
    }
  });

  // A returning visitor deep in a tool should still see which section they are
  // in, which is the whole point of putting the nav on every page.
  it('highlights the section a tool page belongs to', () => {
    expect(activeCategory(pathFor('pdf-merge', 'en'))).toBe(TOOL_CATEGORY['pdf-merge']);
    expect(activeCategory(pathFor('mouse-test', 'es'))).toBe('device');
  });

  it('highlights nothing on the home page or an unknown path', () => {
    expect(activeCategory('/')).toBeNull();
    expect(activeCategory('/es')).toBeNull();
    expect(activeCategory('/about')).toBeNull();
    expect(activeCategory('/nope')).toBeNull();
  });
});
