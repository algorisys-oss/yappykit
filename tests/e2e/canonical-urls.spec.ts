import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Every URL the sitemap advertises must serve its own page directly.
 *
 * This exists because it once did not. The prerenderer wrote
 * `<slug>/index.html`, Cloudflare Pages answered every slash-free canonical URL
 * with a 308, and the local test server hid it by resolving that case to a 200.
 * So the whole sitemap pointed at redirects, every hreflang alternate pointed at
 * a redirect, and the suite was green.
 */
const paths = [...readFileSync(new URL('../../dist/sitemap.xml', import.meta.url), 'utf8')
  .matchAll(/<loc>https:\/\/yappykit\.com([^<]*)<\/loc>/g)]
  .map((m) => m[1] || '/');

test('the sitemap is not empty', () => {
  expect(paths.length).toBeGreaterThan(150);
});

test('no canonical URL redirects', async ({ request }) => {
  const redirects: string[] = [];
  for (const p of paths) {
    const res = await request.get(p, { maxRedirects: 0 });
    if (res.status() !== 200) redirects.push(`${p} -> ${res.status()} ${res.headers()['location'] ?? ''}`);
  }
  expect(redirects, 'these are advertised in the sitemap but do not serve directly').toEqual([]);
});

test('the trailing-slash form is not a second live copy of the page', async ({ request }) => {
  // One canonical form. /foo/ must redirect to /foo, not serve it.
  const res = await request.get('/random-word-generator/', { maxRedirects: 0 });
  expect([301, 308, 404]).toContain(res.status());
});
