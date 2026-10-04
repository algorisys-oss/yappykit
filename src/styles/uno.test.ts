import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGenerator } from 'unocss';
import config from '../../uno.config';

/**
 * Guards the generated stylesheet against a failure that only one browser sees.
 *
 * UnoCSS merges utilities with identical bodies into one selector list. A
 * browser drops a WHOLE rule when any selector in its list is one it does not
 * understand, so `[&::-webkit-scrollbar]:hidden` was merged with `.hidden`
 * into `...::-webkit-scrollbar,.hidden{display:none}`, Firefox threw the rule
 * away, and every `hidden` class on the site stopped hiding there: the header
 * showed its desktop items on a phone and overflowed by 103px.
 */

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx|ts)$/.test(name) && !name.endsWith('.test.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('generated CSS', async () => {
  const uno = await createGenerator(config);
  const { css } = await uno.generate(sources(join(__dirname, '..')).join('\n'), { preflights: false });
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];

  it('never groups a vendor-prefixed selector with other selectors', () => {
    const offenders = rules
      .map((r) => r.slice(0, r.indexOf('{')).trim())
      .filter((sel) => sel.includes(',') && /::?-(webkit|moz|ms)-/.test(sel));
    expect(offenders).toEqual([]);
  });

  it('emits `hidden` in a rule every browser can parse', () => {
    const hidden = rules.find((r) => /(^|,)\s*\.hidden\s*(,|\{)/.test(r));
    expect(hidden).toBeDefined();
    expect(hidden).not.toMatch(/-webkit-|-moz-/);
  });
});
