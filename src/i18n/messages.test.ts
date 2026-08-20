import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from './locales';
import { MESSAGES } from './all-messages';

/**
 * Copy hygiene across the locale bundles.
 *
 * Every rule here exists because a bulk edit broke it. Prose is mechanical to
 * transform and easy to damage in ways a typecheck cannot see: an unbalanced
 * parenthesis, a comma where a script uses a different one, a fragment left
 * behind by a replaced dash.
 */

const DIR = join(__dirname, 'messages');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

/** Every string literal value in a bundle, roughly, one per source line. */
function linesOf(file: string): { n: number; text: string }[] {
  return readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }));
}

describe('locale bundles', () => {
  it('covers every declared locale', () => {
    for (const l of LOCALES) {
      expect(MESSAGES[l.code], `${l.code} has no message bundle`).toBeDefined();
    }
  });

  it.each(FILES)('%s has balanced parentheses on every line', (file) => {
    // A bulk dash-to-parenthesis rewrite once deleted closing parens, producing
    // "knobs (quality sliders, bitrate fields, DPI values, when all you wanted".
    const bad = linesOf(file).filter(
      (l) => (l.text.match(/\(/g) ?? []).length !== (l.text.match(/\)/g) ?? []).length,
    );
    expect(bad.map((l) => `${file}:${l.n}`)).toEqual([]);
  });

  it.each(FILES)('%s has no em-dash outside the Russian copula', (file) => {
    // The em-dash reads as machine-written English. Russian keeps it in
    // "X — это Y", where it stands in for the verb "to be" and is mandatory.
    const offenders = linesOf(file).filter(
      (l) => l.text.includes('—') && !l.text.includes('— это'),
    );
    expect(offenders.map((l) => `${file}:${l.n}: ${l.text.trim().slice(0, 60)}`)).toEqual([]);
  });

  it('uses Arabic and Japanese commas in Arabic and Japanese prose', () => {
    const checks: [string, RegExp][] = [
      ['ar.ts', /[؀-ۿ]\s*,\s*[؀-ۿ]/g],
      ['ja.ts', /[぀-ヿ一-鿿]\s*,\s*[぀-ヿ一-鿿]/g],
    ];
    for (const [file, pattern] of checks) {
      const src = readFileSync(join(DIR, file), 'utf8');
      expect(src.match(pattern) ?? [], `${file} uses a Latin comma in native prose`).toEqual([]);
    }
  });

  it('never leaves a fragment appended mid-sentence starting with a colon', () => {
    // savedFragment and removedExtra are interpolated INTO another sentence, so
    // a leading colon produces "Done: 97 KB: 40% smaller."
    for (const l of LOCALES) {
      const m = MESSAGES[l.code]!;
      for (const key of ['image-compress', 'video-compress', 'pdf-compress'] as const) {
        const ui = m.tools[key].ui as Record<string, string>;
        if ('savedFragment' in ui) {
          expect(ui.savedFragment!.trimStart(), `${l.code}/${key}`).not.toMatch(/^:/);
        }
      }
      const meta = m.tools['metadata-remove'].ui as Record<string, string>;
      expect(meta.removedExtra!.trimStart(), `${l.code} removedExtra`).not.toMatch(/^:/);
    }
  });

  it('keeps every interpolation token that the English reference defines', () => {
    const tokens = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const walk = (a: unknown, b: unknown, path: string, out: string[]) => {
      if (typeof a === 'string') {
        if (typeof b !== 'string') return;
        const [ta, tb] = [tokens(a), tokens(b)];
        if (ta.join() !== tb.join()) out.push(`${path}: expected ${ta} got ${tb}`);
      } else if (Array.isArray(a) && Array.isArray(b)) {
        a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`, out));
      } else if (a && b && typeof a === 'object') {
        for (const k of Object.keys(a as object)) {
          walk((a as never)[k], (b as never)[k], `${path}.${k}`, out);
        }
      }
    };
    const en = MESSAGES.en!;
    for (const l of LOCALES) {
      if (l.code === 'en') continue;
      const problems: string[] = [];
      walk(en, MESSAGES[l.code], l.code, problems);
      expect(problems).toEqual([]);
    }
  });
});
