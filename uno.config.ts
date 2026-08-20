import { defineConfig, presetWind } from 'unocss';

// UnoCSS theme keys map onto zen-ui-core's --zen-color-* custom properties, so
// our utility classes (landing pages, local components) and zen's own
// components resolve to ONE palette. Light/dark follows `data-theme` on <html>.
// Values are hex vars (not alpha-composable) — avoid `/opacity` utilities on
// these; use the *-soft / surface / muted tokens for lighter surfaces instead.
export default defineConfig({
  presets: [presetWind()],
  // The prerendered static HTML (src/prerender) is emitted by a separate SSR
  // build, so its markup never passes through the client module graph and Uno
  // would not see the utility classes it uses. Scan it from disk instead, or
  // the prerendered page — the one crawlers and no-JS visitors see — ships
  // unstyled.
  content: {
    filesystem: ['src/prerender/**/*.ts'],
    // UnoCSS's default pipeline matches .tsx/.jsx/.vue/.html and NOT plain .ts,
    // so without widening it the files above are read and then silently
    // discarded — the prerendered page ships with classes that have no CSS.
    // Keep the upstream default and add the prerender sources to it.
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        /src[\\/]prerender[\\/].*\.ts$/,
      ],
    },
  },
  theme: {
    colors: {
      bg: 'var(--zen-color-background)',
      fg: 'var(--zen-color-foreground)',
      surface: 'var(--zen-color-muted)', // soft neutral background
      muted: 'var(--zen-color-muted-fg)', // secondary/muted text
      border: 'var(--zen-color-border)',
      accent: {
        DEFAULT: 'var(--zen-color-primary)',
        fg: 'var(--zen-color-primary-fg)',
        soft: 'var(--zen-color-primary-soft)',
      },
      danger: {
        DEFAULT: 'var(--zen-color-error)',
        fg: 'var(--zen-color-error-fg)',
        soft: 'var(--zen-color-error-soft)',
      },
      success: {
        DEFAULT: 'var(--zen-color-success)',
        fg: 'var(--zen-color-success-fg)',
        soft: 'var(--zen-color-success-soft)',
      },
    },
    borderRadius: {
      DEFAULT: 'var(--zen-radius-md)',
      sm: 'var(--zen-radius-sm)',
      lg: 'var(--zen-radius-lg)',
    },
  },
});
