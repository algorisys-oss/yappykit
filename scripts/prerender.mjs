#!/usr/bin/env node
/**
 * Static prerender step. Runs after `vite build`.
 *
 * WHY THIS EXISTS: the app is a client-rendered SPA on static hosting, so
 * without this every route is served the home page's <head> — including its
 * canonical, which tells Google that every tool page is a duplicate of the home
 * page. Runtime head patching happens after JS executes, far too late for a
 * canonical and useless to any crawler that does not run JS.
 *
 * The render logic is TypeScript sharing the app's own route table and message
 * data, so it is compiled through Vite's SSR build (no extra dependency, no
 * duplicated route list) and then imported and run.
 */
import { build } from 'vite';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WORK = path.resolve('.prerender');
const DIST = path.resolve('dist');

async function main() {
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: path.resolve('src/prerender/render.ts'),
      outDir: WORK,
      emptyOutDir: true,
      minify: false,
      target: 'node22',
      rollupOptions: { output: { entryFileNames: 'render.mjs', format: 'esm' } },
    },
  });

  const mod = await import(pathToFileURL(path.join(WORK, 'render.mjs')).href);
  const lastmod = new Date().toISOString().slice(0, 10);
  const report = await mod.renderAll(DIST, lastmod);

  await rm(WORK, { recursive: true, force: true });

  console.log(`\n  prerendered ${report.pages} pages · locales: ${report.locales.join(', ')}`);
  if (report.missing.length) {
    // Loud, but not fatal: an untranslated locale is simply not published. It is
    // absent from the sitemap and from every hreflang cluster, so Google is
    // never told about a page that does not exist.
    console.log(
      `  NOT PUBLISHED (no translation yet): ${report.missing.join(', ')}\n` +
        `  Add src/i18n/messages/<locale>.ts and register it in messages/all.ts to ship one.`,
    );
  }
  console.log('  sitemap.xml + robots.txt + 404.html written\n');
}

main().catch((err) => {
  console.error('\nPrerender failed:\n', err);
  process.exit(1);
});
