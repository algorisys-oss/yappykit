import { A, useLocation } from '@solidjs/router';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import HeaderSearch from './HeaderSearch';
import CategoryNav from './CategoryNav';
import { useI18n } from '../i18n/runtime';

/**
 * Global app header. Plain Solid + router links — no component-library JS, so
 * it's safe on the landing route's budget. Rendered by the root layout, so it
 * appears on every page: brand, global search, theme toggle, and a row of links
 * to the category hubs.
 *
 * The top row is a FIXED height and does not wrap. It used to be `flex-wrap`
 * with the search sized by its own content, and a flex item will not shrink
 * below its intrinsic width unless told to: the intrinsic width of an
 * `<input type="search">` is a UA default, and Chrome's is wider than Firefox's,
 * so the same viewport wrapped the row onto two lines in one browser and not the
 * other. `min-w-0` plus a fixed height makes the header the same size in every
 * engine.
 */
export default function Header() {
  const { m, path } = useI18n();
  const location = useLocation();
  return (
    <header class="sticky top-0 z-20 border-b border-border bg-bg">
      <div class="mx-auto flex h-14 max-w-4xl items-center gap-3 px-6">
        <A href={path('home')} class="flex shrink-0 items-center gap-2 no-underline">
          <Logo class="h-7 w-7" />
          <span class="hidden text-lg font-bold text-fg sm:inline">YappyKit</span>
          <span class="hidden text-xs text-muted xl:inline">{m.common.tagline}</span>
        </A>

        <div class="min-w-0 flex-1">
          <HeaderSearch />
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <span class="hidden rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted lg:inline-block">
            {m.common.headerNoUploads}
          </span>
          <ThemeToggle />
        </div>
      </div>

      <CategoryNav pathname={location.pathname} />
    </header>
  );
}
