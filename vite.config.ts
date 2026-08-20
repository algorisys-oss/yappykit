/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import unocss from 'unocss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    unocss(),
    solid(),
    // PWA: makes the "Works offline" promise real. The app shell + code chunks
    // are precached; the huge on-demand assets (ffmpeg .wasm, OCR language packs)
    // are runtime-cached the first time they're used, never precached.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'YappyKit — private file tools',
        short_name: 'YappyKit',
        description: 'Everyday file tools that run in your browser. No uploads.',
        theme_color: '#0ea5e9',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // The 32 MB ffmpeg core and any wasm are excluded from precache and
        // cached at runtime instead (below).
        globIgnores: ['**/ffmpeg-core*', '**/*.wasm', '**/*.wasmz'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Explicitly OFF. vite-plugin-pwa defaults it to 'index.html', which
        // installs a NavigationRoute bound to the precached /index.html, so
        // every navigation — including /es/... —
        // would be answered with the ENGLISH HOME page's prerendered HTML, and
        // the router would then have to repaint the correct route client-side.
        // That throws away the per-route prerendering entirely for returning
        // visitors. Navigations go NetworkFirst instead: online they get the
        // real prerendered page for that URL and locale; offline they fall back
        // to whatever copy of that page is cached.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'yappykit-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 64 },
            },
          },
          {
            // .wasmz is the gzipped ffmpeg core; see src/core/video/ffmpeg.ts.
            urlPattern: ({ url }) => /\.wasmz?$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'yappykit-wasm', expiration: { maxEntries: 8 } },
          },
          {
            // Tesseract worker/core and language packs (loaded from its CDN).
            urlPattern: /tesseract|traineddata|tessdata/i,
            handler: 'CacheFirst',
            options: { cacheName: 'yappykit-ocr', expiration: { maxEntries: 12 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@routes': fileURLToPath(new URL('./src/routes', import.meta.url)),
      // zen-ui is vendored as a git submodule (not published to npm). We consume
      // the Solid binding's built library output directly; its transitive
      // externals (Kobalte, TanStack, zen-ui-core source) resolve from the
      // submodule's own node_modules. Rebuild after updating the submodule:
      //   (cd vendor/zen-ui && bun run build:lib:solid)
      // Shared design tokens (the --zen-color-* values). Small; loads on every
      // page including the landing route so its utilities have real colours.
      '@algorisys/zen-ui-core/tokens.css': fileURLToPath(
        new URL('./vendor/zen-ui/packages/core/styles/tokens.css', import.meta.url),
      ),
      '@algorisys/zen-ui-solid/styles': fileURLToPath(
        new URL('./vendor/zen-ui/packages/solid/dist/style.css', import.meta.url),
      ),
      '@algorisys/zen-ui-solid': fileURLToPath(
        new URL('./vendor/zen-ui/packages/solid/dist/index.js', import.meta.url),
      ),
    },
    // The prebuilt binding imports 'solid-js'; without deduping we'd load two
    // copies and reactivity would silently break across the boundary.
    dedupe: ['solid-js', 'solid-js/web', 'solid-js/store'],
  },
  // COOP/COEP is applied per-route in production via Cloudflare `_headers`,
  // which is GENERATED from the route table (src/prerender/render.ts) so it
  // stays correct as locales are added. In dev we enable cross-origin isolation
  // globally so the video route's SharedArrayBuffer path can be exercised.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    // No manualChunks on purpose. Each tool route is a dynamic import, so Vite
    // splits it (and its heavy deps — zen-ui/DataTable, xlsx) into its own
    // chunk and shares common code only across the async routes that use it.
    // Hand-grouping previously swept Vite's __vitePreload helper into the zen-ui
    // chunk, which the entry imports statically — that preloaded the whole heavy
    // chunk on the landing page and blew the JS budget. Let Vite decide.
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Solid components need the browser-condition transform; see vitest-solid docs.
    server: { deps: { inline: [/solid-js/, /@solidjs/, /@algorisys/] } },
  },
});
