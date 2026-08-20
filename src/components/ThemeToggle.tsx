import { createSignal } from 'solid-js';
import { getTheme, applyTheme, type Theme } from '../lib/theme';
import { useI18n } from '../i18n/runtime';

/**
 * Light/dark toggle. Sun icon when dark (tap to go light), moon when light.
 * The choice persists via applyTheme; index.html applies it before first paint.
 */
export default function ThemeToggle() {
  const { m } = useI18n();
  const [theme, setTheme] = createSignal<Theme>(getTheme());
  const toggle = () => {
    const next: Theme = theme() === 'dark' ? 'default' : 'dark';
    setTheme(next);
    applyTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={m.common.themeLabel}
      aria-label={theme() === 'dark' ? m.common.themeToLight : m.common.themeToDark}
      class="inline-flex h-9 w-9 items-center justify-center rounded border border-border text-fg transition hover:border-accent"
    >
      {theme() === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
