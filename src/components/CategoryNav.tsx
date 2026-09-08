import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { activeCategory, categoryLinks } from '../lib/categories';
import { useI18n } from '../i18n/runtime';

/**
 * The header's category menu: one link per category hub, plus "all tools".
 *
 * Plain router links, no component library — this rides on the landing route,
 * which is budget-gated (docs/05). It scrolls sideways rather than wrapping so
 * the header keeps one fixed height at every width.
 */
export default function CategoryNav(props: { pathname: string }) {
  const { m, locale, path } = useI18n();
  const active = () => activeCategory(props.pathname);
  const onHome = () => props.pathname === path('home');

  return (
    <nav aria-label={m.common.categoryNav} class="border-t border-border">
      <ul class="mx-auto my-0 flex max-w-4xl list-none items-center gap-5 overflow-x-auto px-6 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li>
          <Item href={path('home')} label={m.common.backToTools} active={onHome()} />
        </li>
        <For each={categoryLinks(m, locale)}>
          {(link) => (
            <li>
              <Item href={link.href} label={link.label} active={active() === link.category} />
            </li>
          )}
        </For>
      </ul>
    </nav>
  );
}

function Item(props: { href: string; label: string; active: boolean }) {
  return (
    <A
      href={props.href}
      aria-current={props.active ? 'page' : undefined}
      class={`inline-flex h-10 items-center whitespace-nowrap border-b-2 text-sm no-underline transition ${
        props.active
          ? 'border-accent font-semibold text-fg'
          : 'border-transparent text-muted hover:border-border hover:text-fg'
      }`}
    >
      {props.label}
    </A>
  );
}
