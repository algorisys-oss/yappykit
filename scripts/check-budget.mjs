#!/usr/bin/env node
/**
 * Landing-page JS budget gate.
 *
 * The content pages are the SEO asset; their initial JS must stay under budget
 * (docs/05-architecture.md). We measure the TRUE eager payload: the scripts and
 * modulepreloads the built index.html actually references. Lazy route/vendor
 * chunks (tool code, xlsx, DataTable) are not preloaded there, so they don't
 * count — which is the whole point of the split. Run after `vite build`.
 */
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const BUDGET_BYTES = 100 * 1024; // 100 KB gzipped
const DIST = path.resolve('dist');

async function main() {
  let html;
  try {
    html = await readFile(path.join(DIST, 'index.html'), 'utf8');
  } catch {
    console.error('No dist/index.html — run `npm run build` first.');
    process.exit(2);
  }

  // Eager JS = <script src> + <link rel="modulepreload" href>. These are the
  // files the browser fetches to render the landing route; nothing else.
  const refs = new Set();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)) {
    refs.add(m[1]);
  }
  if (refs.size === 0) {
    console.error('No eager scripts found in index.html — unexpected.');
    process.exit(2);
  }

  let total = 0;
  for (const ref of [...refs].sort()) {
    const full = path.join(DIST, ref.replace(/^\//, ''));
    if (!(await stat(full).catch(() => null))?.isFile()) continue;
    const gz = gzipSync(await readFile(full)).byteLength;
    total += gz;
    console.log(`  ${ref}  ${(gz / 1024).toFixed(1)} KB gz`);
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  if (total > BUDGET_BYTES) {
    console.error(`\n✗ Landing JS ${kb(total)} gz exceeds budget ${kb(BUDGET_BYTES)}.`);
    process.exit(1);
  }
  console.log(`\n✓ Landing JS ${kb(total)} gz within budget ${kb(BUDGET_BYTES)}.`);
}

main();
