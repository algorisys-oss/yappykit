<!--
  The README published to the public mirror (algorisys-oss/yappykit) by
  scripts/publish-oss.mjs, which writes it out as README.md there.

  It exists separately because the working repo's README links into docs/,
  which the mirror does not carry. Keep this one free of links to anything
  that is not published.
-->

# YappyKit

Privacy-first, browser-native file and data tools. **Useful tools. No uploads.**

Every tool runs entirely in your browser. Files are read, processed and written back on
your own device: nothing is uploaded to an application server, because there is no
application server. That is a property of the architecture rather than a promise, and it
is the reason this repository is public — you can check the claim rather than believe it.

Advertising and analytics scripts on the hosted site make ordinary network requests like
any other site. No request carries your file. Open DevTools → Network and watch.

## What's in it

Twelve tools, each stating its job as the result you already want rather than the
parameters that produce it. Compress an image to *under 100 KB*, not to *quality 0.72*.

Image and PDF size compression, video compression to a WhatsApp or email limit, passport
and visa photos, document scan cleanup, spreadsheet compare, metadata removal, an online
ruler, mouse and keyboard testers, a webcam and microphone test, and a random word
generator. Twelve locales, each with translated URLs and prerendered content.

## Stack

SolidJS + TypeScript + Vite. The design system is **zen-ui**, a Kobalte-backed Solid
binding, vendored as a git submodule. UnoCSS utilities over shared `--zen-*` tokens.
Vitest for unit tests, Playwright for cross-browser end-to-end tests.

Every route is prerendered to static HTML at build time, so the site works with
JavaScript disabled and deploys as static files to any host.

## Setup

```bash
git clone --recurse-submodules https://github.com/algorisys-oss/yappykit.git
cd yappykit
npm install
npm run zen:build     # builds the vendored zen-ui Solid lib (needs bun)
npm run dev
```

`zen:build` is required once, and again after updating the submodule. zen-ui is not
published to npm, so its Solid binding is built from `vendor/zen-ui` and consumed through
a Vite alias. Without it, neither the dev server nor the build can resolve
`@algorisys/zen-ui-solid`.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Vite dev server (cross-origin isolated, for the video route's SharedArrayBuffer path) |
| `npm run build` | Production build, then prerender every route in every locale |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright cross-browser tests |
| `npm run budget` | Fail the build if landing-page JS exceeds 100 KB gzipped |
| `npm run zen:build` | Build the vendored zen-ui Solid library |

## Layout

- `src/core/` — the product logic, framework-free and unit-tested. One directory per
  domain; see `src/core/README.md`.
- `src/routes/` — the landing page (ships no component-library JS, enforced by
  `npm run budget`) and the tool routes, which are lazily loaded.
- `src/prerender/` — turns the route table into static HTML, `sitemap.xml`, `robots.txt`
  and the per-route `_headers` file.
- `src/i18n/` — the route table, one slug per locale, and the message bundles.
- `src/lib/zen.tsx` — the single integration seam to zen-ui.
- `vendor/zen-ui/` — the design-system submodule.

## Deployment

The build emits a `dist/` of static files plus a `_headers` file that applies
cross-origin isolation to the video route only, so that multithreaded ffmpeg.wasm gets
`SharedArrayBuffer` without breaking scripts on every other page.

```bash
npm run zen:build && npm run build
```
