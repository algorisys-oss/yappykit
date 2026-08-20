/**
 * Theme control. zen-ui themes off `data-theme` on <html>: 'default' (light) or
 * 'dark'. The choice is persisted; index.html applies it before first paint to
 * avoid a flash of the wrong theme. If the user never chose, we follow the OS.
 */
export type Theme = 'default' | 'dark';

export const THEME_KEY = 'yappykit-theme';

export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'default') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}
