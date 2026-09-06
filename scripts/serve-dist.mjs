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
 *
 * It also applies `dist/_headers`, and that is not a nicety either. The PDF
 * password tool needs COOP/COEP to get SharedArrayBuffer, and without it qpdf
 * does not fail, it HANGS (spike/qpdf-encrypt/FINDINGS.md). An emulator that
 * withholds a header production sends makes that tool untestable and every
 * other isolated route a guess.
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

/**
 * Parse `dist/_headers` into [matcher, headers] pairs.
 *
 * Only the two shapes this site generates are supported: an exact path, and a
 * `/prefix/*` wildcard. Pages' full syntax has more in it, and guessing at the
 * rest would make this emulator confidently wrong rather than usefully narrow.
 * Later rules win, which is how Pages applies them.
 */
async function loadHeaderRules() {
  const raw = await readFile(path.join(DIST, '_headers'), 'utf8').catch(() => null);
  if (!raw) return [];
  const rules = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const at = line.indexOf(':');
    if (at > 0 && current) current.headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}

function headersFor(rules, urlPath) {
  const out = {};
  for (const { pattern, headers } of rules) {
    const hit = pattern.endsWith('/*')
      ? urlPath.startsWith(pattern.slice(0, -1))
      : pattern === urlPath || `${pattern}/` === urlPath;
    if (hit) Object.assign(out, headers);
  }
  return out;
}

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

const HEADER_RULES = await loadHeaderRules();

createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const extra = headersFor(HEADER_RULES, urlPath);
  const hit = await resolve(req.url ?? '/');
  if (hit?.redirect) {
    res.writeHead(308, { location: hit.redirect });
    res.end();
    return;
  }
  if (hit) {
    res.writeHead(200, {
      'content-type': TYPES[path.extname(hit.file)] ?? 'application/octet-stream',
      ...extra,
    });
    res.end(hit.body);
    return;
  }
  const notFound = await readIfFile(path.join(DIST, '404.html'));
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(notFound ?? 'Not found');
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT} (Pages semantics)`));
