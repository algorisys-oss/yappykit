import { A, useLocation } from '@solidjs/router';
import { For, Show, createMemo } from 'solid-js';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { BUILD_GUIDES } from '../content/build-guides';
import { BUILD_GUIDE_META } from '../content/build-guide-meta';
import { pathFor, resolveRoute, type BuildGuideTool, type BuildKey } from '../i18n/routes';

/**
 * One tool's build guide.
 *
 * Every `build/<tool>` route shares this component, so it takes the tool from
 * the URL rather than from a prop: the router maps a path to a component and
 * has nowhere to put the key. `resolveRoute` is the same function the rest of
 * the site uses to turn a path back into a route, so this cannot disagree with
 * the table about which page it is on.
 *
 * English only, like the guides themselves. The link back to the tool is
 * generated for the current locale, because someone can arrive here from a
 * translated page and should be sent back to one.
 */
export default function BuildGuidePage() {
  const location = useLocation();
  const { m, locale } = useI18n();

  const tool = createMemo<BuildGuideTool>(() => {
    const key = resolveRoute(location.pathname)?.key as BuildKey | undefined;
    // The route table only ever points here for keys of this shape.
    return (key?.slice('build/'.length) ?? 'pdf-password') as BuildGuideTool;
  });

  const guide = createMemo(() => BUILD_GUIDES[tool()]);
  useSeo(`build/${tool()}` as BuildKey);

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <p class="text-sm text-muted">
        <A href="/build" class="text-accent underline">
          Build guides
        </A>
      </p>
      <h1 class="mt-2 text-3xl font-bold">{BUILD_GUIDE_META[tool()].title}</h1>
      <p class="mt-4 max-w-prose text-lg text-muted">{guide().intro}</p>

      <div class="mt-8 rounded border border-border bg-surface p-4">
        <h2 class="text-sm font-semibold">What it is built with</h2>
        <ul class="mt-2 list-disc space-y-1 ps-5 text-sm text-fg">
          <For each={guide().stack}>{(s) => <li>{s}</li>}</For>
        </ul>
      </div>

      <nav class="mt-6 rounded border border-border bg-surface p-4" aria-label="On this page">
        <h2 class="text-sm font-semibold">On this page</h2>
        <ul class="mt-2 space-y-1 text-sm">
          <For each={guide().sections}>
            {(sec) => (
              <li>
                <a href={`#${sec.id}`} class="text-accent underline">
                  {sec.heading}
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>

      <div class="mt-10 space-y-10 text-sm leading-relaxed text-fg">
        <For each={guide().sections}>
          {(sec) => (
            <section id={sec.id}>
              <h2 class="text-xl font-bold">{sec.heading}</h2>
              <For each={sec.paragraphs}>{(p) => <p class="mt-3 max-w-prose">{p}</p>}</For>
              <Show when={sec.bullets}>
                {(items) => (
                  <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5">
                    <For each={items()}>{(b) => <li>{b}</li>}</For>
                  </ul>
                )}
              </Show>
              <Show when={sec.code}>
                {(code) => (
                  <figure class="mt-4">
                    <figcaption class="text-xs text-muted">{code().caption}</figcaption>
                    {/* Wide code must scroll inside its own box, never the page. */}
                    <pre class="mt-1 overflow-x-auto rounded border border-border bg-surface p-3 text-xs leading-relaxed">
                      <code>{code().source}</code>
                    </pre>
                  </figure>
                )}
              </Show>
            </section>
          )}
        </For>

        <section id="pitfalls">
          <h2 class="text-xl font-bold">What went wrong</h2>
          <p class="mt-3 max-w-prose">
            The most useful part of any build write-up, and the part usually left out.
          </p>
          <ul class="mt-3 max-w-prose list-disc space-y-2 ps-5">
            <For each={guide().pitfalls}>{(p) => <li>{p}</li>}</For>
          </ul>
        </section>

        <p class="border-t border-border pt-6 text-muted">
          Use the tool:{' '}
          <A href={pathFor(tool(), locale)} class="text-accent underline">
            {m.tools[tool()].title}
          </A>
          {' · '}
          <A href="/how-it-works" class="text-accent underline">
            How YappyKit works
          </A>
        </p>
      </div>
    </main>
  );
}
