import { describe, it, expect } from 'vitest';
import { fileForPath } from './render';
import { allPaths } from '../i18n/routes';

/**
 * The output shape is an SEO decision, not a filesystem detail.
 *
 * Canonical URLs carry no trailing slash. Cloudflare Pages serves `/foo` from
 * `foo.html` directly, but answers it with a 308 to `/foo/` when only
 * `foo/index.html` exists — which would put every canonical URL on the site one
 * redirect away from its own page.
 */
describe('fileForPath', () => {
  it('writes the flat form, so the canonical URL is served without a redirect', () => {
    expect(fileForPath('/compress-image-to-size')).toBe('compress-image-to-size.html');
    expect(fileForPath('/de/zufallswortgenerator')).toBe('de/zufallswortgenerator.html');
  });

  it('keeps the site root as index.html', () => {
    expect(fileForPath('/')).toBe('index.html');
    expect(fileForPath('')).toBe('index.html');
  });

  it('gives a locale root its own file beside the locale directory', () => {
    // `es.html` and `es/` coexist; the first serves /es, the second /es/<tool>.
    expect(fileForPath('/es')).toBe('es.html');
    expect(fileForPath('/es/')).toBe('es.html');
  });

  it('never emits a directory index, for any route we actually ship', () => {
    const offenders = allPaths()
      .map((r) => r.path)
      .filter((p) => p !== '/' && fileForPath(p).endsWith('/index.html'));
    expect(offenders).toEqual([]);
  });
});
