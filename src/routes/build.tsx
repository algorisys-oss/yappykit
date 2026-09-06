import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { BUILD_GUIDES } from '../content/build-guides';
import { BUILD_GUIDE_META } from '../content/build-guide-meta';
import { BUILD_GUIDE_TOOLS, pathFor } from '../i18n/routes';

/**
 * The build-guide hub.
 *
 * Exists so the guides are reachable by a crawler and by a reader who does not
 * already know one is there. A page nothing links to is close to invisible, and
 * these are the only pages on the site that are not either a tool or a policy.
 */
export default function BuildIndex() {
  const { m, locale } = useI18n();
  useSeo('build');

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">Build guides</h1>
      <p class="mt-4 max-w-prose text-lg text-muted">
        How the tools on this site were actually made: the engine choices, the code, and the
        mistakes. Written for people who want to build something similar, or who want to check
        that the privacy claims hold up before trusting them.
      </p>
      <p class="mt-4 max-w-prose text-sm text-muted">
        These are English only. They are long technical writing whose value is precision, and a
        machine-translated approximation of a precise claim is just a wrong claim.
      </p>

      <ul class="mt-10 space-y-8">
        <For each={BUILD_GUIDE_TOOLS}>
          {(tool) => (
            <li class="border-b border-border pb-8 last:border-b-0">
              <h2 class="text-xl font-bold">
                <A href={pathFor(`build/${tool}`, 'en')} class="text-accent no-underline hover:underline">
                  {BUILD_GUIDE_META[tool].title}
                </A>
              </h2>
              <p class="mt-2 max-w-prose text-sm leading-relaxed text-fg">
                {BUILD_GUIDES[tool].intro}
              </p>
              <p class="mt-3 text-sm text-muted">
                Uses the tool:{' '}
                <A href={pathFor(tool, locale)} class="text-accent underline">
                  {m.tools[tool].title}
                </A>
              </p>
            </li>
          )}
        </For>
      </ul>

      <p class="mt-10 border-t border-border pt-6 text-sm text-muted">
        For the shorter version that covers the whole site rather than one tool, see{' '}
        <A href="/how-it-works" class="text-accent underline">
          how YappyKit works
        </A>
        .
      </p>
    </main>
  );
}
