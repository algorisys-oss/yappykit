import { useLocation } from '@solidjs/router';
import { For, createMemo } from 'solid-js';
import ToolCard from '../components/ToolCard';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { toolList } from '../lib/tools';
import { activeCategory } from '../lib/categories';
import { CATEGORIES, TOOL_CATEGORY, categoryRouteKey } from '../i18n/routes';

/**
 * A category hub: everything in one section, and nothing else.
 *
 * One component serves all six, resolving the category from the path the way
 * the build guides resolve their tool — six near-identical route modules would
 * only be six places for the layout to drift apart.
 *
 * No hero. Someone who arrives here has already decided what kind of job they
 * have, so the page opens on the tools.
 */
export default function CategoryHub() {
  const { m, fmt, locale } = useI18n();
  const location = useLocation();
  // The router only mounts this on a hub URL, so the fallback is unreachable in
  // practice; it exists so the page has a category to render during the frame
  // before a client-side navigation settles.
  const category = () => activeCategory(location.pathname) ?? CATEGORIES[0];
  const tools = createMemo(() => toolList(m, locale).filter((t) => TOOL_CATEGORY[t.key] === category()));

  useSeo(categoryRouteKey(category()));

  return (
    <main class="mx-auto max-w-4xl px-6 pb-16 pt-10">
      <div class="flex flex-wrap items-baseline gap-3">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
          {m.categories.names[category()]}
        </h1>
        <span class="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
          {fmt(m.landing.toolsCount, { n: tools().length })}
        </span>
      </div>
      <p class="mt-3 max-w-2xl text-muted">{m.categories.intro}</p>

      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <For each={tools()}>{(tool) => <ToolCard tool={tool} />}</For>
      </div>
    </main>
  );
}
