import { describe, it, expect } from 'vitest';
import { BUILD_GUIDES } from './build-guides';
import { BUILD_GUIDE_META } from './build-guide-meta';
import { EXPLAINER_SECTIONS, EXPLAINER_INTRO } from './how-it-works';

/**
 * House style for the content modules that are not messages or articles.
 *
 * `../i18n/messages.test` and `../prerender/articles.test` already enforce this
 * across the locale bundles and the per-tool articles. The build guides, the
 * explainer and their metadata arrived later and were covered by neither, which
 * is how four em-dashes got into them: the rule was being remembered rather
 * than enforced. This closes that.
 */

/** Every string a reader actually sees, excluding code samples. */
function prose(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];

  out.push({ where: 'how-it-works intro', text: EXPLAINER_INTRO });
  for (const sec of EXPLAINER_SECTIONS) {
    out.push({ where: `how-it-works/${sec.id} heading`, text: sec.heading });
    sec.paragraphs.forEach((p, i) => out.push({ where: `how-it-works/${sec.id} p${i}`, text: p }));
    (sec.bullets ?? []).forEach((b, i) =>
      out.push({ where: `how-it-works/${sec.id} bullet${i}`, text: b }),
    );
  }

  for (const [tool, guide] of Object.entries(BUILD_GUIDES)) {
    out.push({ where: `${tool} intro`, text: guide.intro });
    guide.stack.forEach((x, i) => out.push({ where: `${tool} stack${i}`, text: x }));
    guide.pitfalls.forEach((x, i) => out.push({ where: `${tool} pitfall${i}`, text: x }));
    for (const sec of guide.sections) {
      out.push({ where: `${tool}/${sec.id} heading`, text: sec.heading });
      sec.paragraphs.forEach((p, i) => out.push({ where: `${tool}/${sec.id} p${i}`, text: p }));
      (sec.bullets ?? []).forEach((b, i) =>
        out.push({ where: `${tool}/${sec.id} bullet${i}`, text: b }),
      );
      // `sec.code.source` is deliberately NOT checked. It is quoted verbatim
      // from the module it names, and one of those real comments contains an
      // em-dash. Editing a quotation to satisfy our own prose style would make
      // the quotation wrong, which is the worse failure.
      if (sec.code) out.push({ where: `${tool}/${sec.id} caption`, text: sec.code.caption });
    }
  }

  for (const [tool, meta] of Object.entries(BUILD_GUIDE_META)) {
    out.push({ where: `${tool} title`, text: meta.title });
    out.push({ where: `${tool} seoTitle`, text: meta.seoTitle });
    out.push({ where: `${tool} seoDescription`, text: meta.seoDescription });
  }

  return out;
}

describe('content style', () => {
  it('uses no em-dash, like the rest of the site', () => {
    const offenders = prose()
      .filter((x) => x.text.includes('—'))
      .map((x) => `${x.where}: ${x.text.slice(0, 60)}`);
    expect(offenders).toEqual([]);
  });

  it('has no unbalanced parentheses', () => {
    const offenders = prose()
      .filter(
        (x) => (x.text.match(/\(/g) ?? []).length !== (x.text.match(/\)/g) ?? []).length,
      )
      .map((x) => x.where);
    expect(offenders).toEqual([]);
  });

  it('gives every guide a title, a description and at least one section', () => {
    for (const [tool, guide] of Object.entries(BUILD_GUIDES)) {
      expect(guide.sections.length, `${tool} has no sections`).toBeGreaterThan(0);
      expect(guide.pitfalls.length, `${tool} has no pitfalls`).toBeGreaterThan(0);
      expect(guide.stack.length, `${tool} lists no stack`).toBeGreaterThan(0);
    }
    for (const [tool, meta] of Object.entries(BUILD_GUIDE_META)) {
      // Long enough to be a real description, short enough for a search result.
      expect(meta.seoDescription.length, `${tool} description too short`).toBeGreaterThan(80);
      expect(meta.seoTitle.length, `${tool} title too long`).toBeLessThan(75);
    }
  });

  it('gives every section a unique anchor id within its guide', () => {
    for (const [tool, guide] of Object.entries(BUILD_GUIDES)) {
      const ids = guide.sections.map((s) => s.id);
      expect(new Set(ids).size, `${tool} has duplicate section ids`).toBe(ids.length);
    }
    const explainerIds = EXPLAINER_SECTIONS.map((s) => s.id);
    expect(new Set(explainerIds).size).toBe(explainerIds.length);
  });
});
