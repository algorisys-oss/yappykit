/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import unocss from 'unocss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** Is this bare specifier actually installed for us to bundle? */
function installed(id: string): boolean {
  try {
    require.resolve(id);
    return true;
  } catch {
    return false;
  }
}

const ZEN_DIST = '/vendor/zen-ui/packages/solid/dist/';

/**
 * Leave zen-ui's uninstalled optional peers out of the bundle.
 *
 * A few zen-ui components reach for a heavy third-party library through a
 * dynamic import and render a "<x> is not installed" notice when it is absent:
 * leaflet for <Map>, jodit for the rich-text editor. They are optional by
 * design and undeclared as peers, and we render none of those components.
 *
 * Rollup still resolves a dynamic import while it builds the module graph,
 * long before the unused component is tree-shaken away, and an unresolved bare
 * specifier is a hard error. So the ones we have not installed are declared
 * external. Nothing survives into the output: the components are unreachable
 * from our routes, so their chunks are dropped along with the imports.
 *
 * Written as a rule rather than a list of names on purpose. These resolve
 * locally out of vendor/zen-ui/node_modules, which a full `bun install` fills
 * in, and they do NOT exist on the Cloudflare build image, where zen:build
 * installs only the Solid workspace. That divergence is invisible here and
 * fails the deploy there, and it has now cost two releases: leaflet, then jodit
 * one build later. A name we have to add by hand is a name we add after the
 * build has already failed.
 *
 * `installed()` is what keeps this honest. Install one of these deliberately
 * (to actually use <Map>, say) and it stops being external and gets bundled,
 * with no config change.
 */
function externalizeUninstalledZenPeers(id: string, importer: string | undefined): boolean {
  if (!importer?.includes(ZEN_DIST)) return false;
  if (id.startsWith('.') || id.startsWith('/')) return false;
  // solid-js is a real peer that we do install, and it must stay deduped.
  if (id === 'solid-js' || id.startsWith('solid-js/')) return false;
  return !installed(id);
}

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
      // the Solid binding's built library output directly. That bundle inlines
      // its own dependencies (zen-ui-core, Kobalte, TanStack) and externalises
      // only solid-js, so nothing resolves out of the submodule's node_modules
      // at build time. Rebuild after updating the submodule with
      //   npm run zen:build
      // which builds ONLY that client lib — not the SSR bundle or the .d.ts
      // chain. See README, "Keeping the Pages build inside the time limit".
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
    rollupOptions: {
      // See externalizeUninstalledZenPeers above.
      external: externalizeUninstalledZenPeers,
    },
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
