#!/usr/bin/env node
/**
 * Static server that resolves URLs the way the production host does.
 *
 * `vite preview` is an SPA server: it falls back to the root index.html for any
 * path that is not a file on disk, so it would serve the HOME page's head for
 * /keyboard-test and hide the entire point of prerendering.
 *
 * This reproduces Cloudflare Pages' actual resolution order, INCLUDING its
 * redirects. That last part matters: an earlier version of this file resolved
 * `/foo` straight to `foo/index.html` and returned 200, while the real host
 * answers that case with a 308 to `/foo/`. Every canonical URL on the site
 * redirected in production and nothing here noticed, because the emulator was
 * kinder than the host. An emulator that is easier to satisfy than production is
 * worse than no emulator at all.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

async function readIfFile(p) {
  try {
    if (!(await stat(p)).isFile()) return null;
    return await readFile(p);
  } catch {
    return null;
  }
}

/**
 * Cloudflare Pages resolution order:
 *   1. the exact file
 *   2. `<path>.html`            served in place, no redirect
 *   3. `<path>/index.html`      308 to `<path>/`, then served there
 *
 * Returning the redirect rather than quietly serving step 3 is the whole point:
 * it is how a canonical URL that costs an extra hop shows up in the test suite.
 */
async function resolve(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0]);
  const rel = raw.replace(/^\/+/, '');
  const base = path.join(DIST, rel.replace(/\/+$/, ''));
  // Refuse to escape dist.
  if (!base.startsWith(DIST)) return null;

  const trailing = rel.endsWith('/') || rel === '';

  if (rel && !trailing) {
    const direct = await readIfFile(base);
    if (direct) return { body: direct, file: base };

    const flat = `${base}.html`;
    const asFlat = await readIfFile(flat);
    if (asFlat) return { body: asFlat, file: flat };
  }

  const index = path.join(base, 'index.html');
  const asIndex = await readIfFile(index);
  if (asIndex) {
    // The host normalises to the trailing-slash form before serving it.
    if (!trailing) return { redirect: `/${rel}/` };
    return { body: asIndex, file: index };
  }
  return null;
}

createServer(async (req, res) => {
  const hit = await resolve(req.url ?? '/');
  if (hit?.redirect) {
    res.writeHead(308, { location: hit.redirect });
    res.end();
    return;
  }
  if (hit) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(hit.file)] ?? 'application/octet-stream' });
    res.end(hit.body);
    return;
  }
  const notFound = await readIfFile(path.join(DIST, '404.html'));
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(notFound ?? 'Not found');
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT} (Pages semantics)`));
