import { describe, it, expect } from 'vitest';
import { toolList, matchesQuery, searchTools } from './tools';
import en from '../i18n/messages/en';
import { TOOL_KEYS } from '../i18n/routes';

const TOOLS = toolList(en, 'en');

describe('toolList', () => {
  it('has one entry per tool, with a resolved href', () => {
    expect(TOOLS).toHaveLength(TOOL_KEYS.length);
    expect(TOOLS.every((t) => t.href.startsWith('/'))).toBe(true);
  });

  it('resolves hrefs for the requested locale', () => {
    const de = toolList(en, 'de');
    expect(de.find((t) => t.key === 'image-compress')!.href).toBe(
      '/de/bild-auf-groesse-komprimieren',
    );
  });
});

describe('search', () => {
  const find = (q: string) => searchTools(TOOLS, q).map((t) => t.key);

  it('finds a tool by a synonym that is not in its title', () => {
    expect(find('exif')).toContain('metadata-remove');
    expect(find('whatsapp')).toContain('video-compress');
    expect(find('excel diff')).toContain('spreadsheet-compare');
  });

  it('finds the new input-testing tools', () => {
    expect(find('keyboard tester')).toContain('keyboard-test');
    expect(find('scroll')).toContain('mouse-test');
    expect(find('actual size')).toContain('ruler');
  });

  it('requires every term to match, not just one', () => {
    expect(matchesQuery(TOOLS.find((t) => t.key === 'image-compress')!, 'compress video')).toBe(
      false,
    );
  });

  it('returns nothing for an empty query, so the dropdown stays closed', () => {
    expect(searchTools(TOOLS, '')).toEqual([]);
    expect(searchTools(TOOLS, '   ')).toEqual([]);
  });

  it('caps the result count', () => {
    expect(searchTools(TOOLS, 'a', 3).length).toBeLessThanOrEqual(3);
  });
});
