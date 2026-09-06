import { describe, it, expect } from 'vitest';
import { buildLlms } from './render';
import { TOOL_KEYS, TOOL_CATEGORY, CATEGORIES, SITE, pathFor } from '../i18n/routes';
import en from '../i18n/messages/en';

/**
 * /llms.txt, in the format proposed at llmstxt.org.
 *
 * The file is only worth publishing if it is true, and the way a hand-written
 * site map stops being true is that a tool ships and nobody edits it. So it is
 * generated from the route table, and these are the tests that keep it that
 * way: every tool present, none invented, and the count in the prose counted
 * rather than typed.
 */
describe('llms.txt', () => {
  const text = buildLlms();

  it('lists every tool, each exactly once', () => {
    for (const key of TOOL_KEYS) {
      const url = `${SITE}${pathFor(key, 'en')}`;
      const hits = text.split(`(${url})`).length - 1;
      expect(hits, `${key} should appear once, appeared ${hits} times`).toBe(1);
    }
  });

  it('links nothing that is not a real route', () => {
    const linked = [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]!);
    const known = new Set([
      ...TOOL_KEYS.map((k) => `${SITE}${pathFor(k, 'en')}`),
      ...(['about', 'privacy', 'terms'] as const).map((k) => `${SITE}${pathFor(k, 'en')}`),
      'https://github.com/algorisys-oss/yappykit',
    ]);
    for (const url of linked) {
      expect(known.has(url), `${url} is linked but is not a route`).toBe(true);
    }
  });

  it('counts the tools rather than stating a number someone typed', () => {
    expect(text).toContain(`${TOOL_KEYS.length} tools`);
  });

  it('groups the tools under every category that has any', () => {
    for (const category of CATEGORIES) {
      if (!TOOL_KEYS.some((k) => TOOL_CATEGORY[k] === category)) continue;
      const inCategory = TOOL_KEYS.filter((k) => TOOL_CATEGORY[k] === category);
      // Each tool's own title has to be the link text, so the file reads as the
      // site does rather than as a list of slugs.
      for (const key of inCategory) {
        expect(text).toContain(`[${en.tools[key].title}]`);
      }
    }
  });

  it('is absolute throughout, since the file is read away from the site', () => {
    expect(text).not.toMatch(/\]\(\/(?!\/)/);
  });

  it('opens the way the format asks: a title, then a one-line summary', () => {
    const lines = text.split('\n');
    expect(lines[0]).toBe('# YappyKit');
    expect(lines[1]).toBe('');
    expect(lines[2]!.startsWith('>')).toBe(true);
  });

  it('says the thing the site is actually for', () => {
    expect(text).toContain('nothing is uploaded');
  });
});
