#!/usr/bin/env node
/**
 * Static server that resolves URLs the way the production host does.
 *
 * `vite preview` is an SPA server: it falls back to the root index.html for any
 * path that is not a file on disk, so it would serve the HOME page's head for
 * /keyboard-test and hide the entire point of prerendering. Cloudflare Pages
 * instead resolves `/foo` to `foo/index.html` and serves `404.html` with a real
 * 404 status for genuine misses.
 *
 * Testing against those semantics is the only way the end-to-end suite proves
 * what actually ships.
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

/** Cloudflare Pages resolution order: exact file, then `<path>/index.html`. */
async function resolve(urlPath) {
  const rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const base = path.join(DIST, rel);
  // Refuse to escape dist.
  if (!base.startsWith(DIST)) return null;

  if (rel) {
    const direct = await readIfFile(base);
    if (direct) return { body: direct, file: base };
  }
  const index = path.join(base, 'index.html');
  const asIndex = await readIfFile(index);
  if (asIndex) return { body: asIndex, file: index };
  return null;
}

createServer(async (req, res) => {
  const hit = await resolve(req.url ?? '/');
  if (hit) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(hit.file)] ?? 'application/octet-stream' });
    res.end(hit.body);
    return;
  }
  const notFound = await readIfFile(path.join(DIST, '404.html'));
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(notFound ?? 'Not found');
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT} (Pages semantics)`));
