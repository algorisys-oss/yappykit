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

/**
 * The machine-readable files are only useful if the host actually serves them.
 * A file written into dist/ that Pages does not serve is invisible, and nothing
 * else in the suite would notice.
 */
test('robots.txt, the sitemap and llms.txt are served', async ({ request }) => {
  for (const file of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
    const res = await request.get(file, { maxRedirects: 0 });
    expect(res.status(), `${file} should serve directly`).toBe(200);
    expect((await res.text()).length, `${file} should not be empty`).toBeGreaterThan(100);
  }
});

test('llms.txt describes the site rather than listing slugs', async ({ request }) => {
  const text = await (await request.get('/llms.txt')).text();
  expect(text.split('\n')[0]).toBe('# YappyKit');
  // Every tool the sitemap knows about, linked with an absolute URL.
  const linked = [...text.matchAll(/\]\((https:\/\/yappykit\.com[^)]*)\)/g)].length;
  expect(linked).toBeGreaterThan(25);
});
