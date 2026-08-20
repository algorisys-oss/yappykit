import { A, useLocation } from '@solidjs/router';
import { Show } from 'solid-js';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import HeaderSearch from './HeaderSearch';
import { useI18n } from '../i18n/runtime';

/**
 * Global app header. Plain Solid + router links — no component-library JS, so
 * it's safe on the landing route's budget. Rendered by the root layout, so it
 * appears on every page. Carries the global tool search, a back link on tool
 * pages, and the theme toggle. On mobile the search wraps to its own line.
 */
export default function Header() {
  const { m, path } = useI18n();
  const location = useLocation();
  const onHome = () => location.pathname === path('home');
  return (
    <header class="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
        {/* Brand group */}
        <div class="order-1 flex items-center gap-3">
          <Show when={!onHome()}>
            <A
              href={path('home')}
              class="inline-flex min-h-9 items-center gap-1 rounded border border-border px-3 py-1.5 text-sm text-fg no-underline transition hover:border-accent"
            >
              <span aria-hidden="true">←</span> {m.common.backToTools}
            </A>
          </Show>
          <A href={path('home')} class="flex items-center gap-2 no-underline">
            <Logo class="h-7 w-7" />
            <span class="text-lg font-bold text-fg">YappyKit</span>
            <span class="hidden text-xs text-muted lg:inline">{m.common.tagline}</span>
          </A>
        </div>

        {/* Global search — inline on desktop, own line on mobile */}
        <div class="order-3 w-full sm:order-2 sm:mx-2 sm:w-auto sm:flex-1">
          <HeaderSearch />
        </div>

        {/* Right controls */}
        <div class="order-2 ms-auto flex items-center gap-2 sm:order-3 sm:ms-0">
          <span class="hidden rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted lg:inline-block">
            {m.common.headerNoUploads}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
