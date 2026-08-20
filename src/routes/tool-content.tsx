import { For } from 'solid-js';
import { A } from '@solidjs/router';
import { useI18n } from '../i18n/runtime';
import { relatedTools, type ToolKey } from '../i18n/routes';

/**
 * Per-tool content: How it works, a step-by-step, "Good to know", an FAQ and
 * related tools. This is the SEO moat and an AdSense requirement (docs/06,
 * docs/07) — every tool page must carry substantive original content, not just
 * a widget.
 *
 * The copy lives in the locale message bundles, so this renders whichever
 * language the route is in, and the prerenderer emits the identical text into
 * the static HTML from the same source.
 *
 * Structured data (FAQPage / HowTo / SoftwareApplication) is NOT injected here:
 * it is written into the prerendered <head> by src/prerender/head.ts. A crawler
 * always loads a URL directly and so always gets it; injecting it again on
 * mount would duplicate every block on first paint.
 */
export default function ToolContent(props: { route: ToolKey }) {
  const { m, path } = useI18n();
  const tool = () => m.tools[props.route];
  const c = () => tool().content;

  return (
    <section class="mt-16 space-y-10 border-t border-border pt-10">
      <div>
        <h2 class="text-xl font-bold">{m.content.howItWorksHeading}</h2>
        <div class="mt-3 space-y-3 text-sm leading-relaxed text-fg">
          <For each={c().howItWorks}>{(p) => <p class="max-w-prose">{p}</p>}</For>
        </div>
      </div>

      <div>
        <h2 class="text-xl font-bold">{m.content.howToUseHeading}</h2>
        <ol class="mt-3 max-w-prose list-none space-y-3 p-0">
          <For each={c().steps}>
            {(s, i) => (
              <li class="flex gap-3 text-sm text-fg">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                  {i() + 1}
                </span>
                <span class="leading-relaxed">{s}</span>
              </li>
            )}
          </For>
        </ol>
      </div>

      <div>
        <h2 class="text-xl font-bold">{m.content.goodToKnowHeading}</h2>
        <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5 text-sm leading-relaxed text-fg">
          <For each={c().tips}>{(t) => <li>{t}</li>}</For>
        </ul>
      </div>

      <div>
        <h2 class="text-xl font-bold">{m.content.faqHeading}</h2>
        <div class="mt-3">
          <For each={c().faqs}>
            {(f) => (
              <details class="border-b border-border py-3">
                <summary class="cursor-pointer text-sm font-medium text-fg">{f.q}</summary>
                <p class="mt-2 max-w-prose text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            )}
          </For>
        </div>
      </div>

      <div>
        <h2 class="text-xl font-bold">{m.content.relatedHeading}</h2>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <For each={relatedTools(props.route)}>
            {(k) => (
              <A
                href={path(k)}
                class="flex flex-col rounded-lg border border-border bg-surface p-4 no-underline transition hover:border-accent"
              >
                <span class="text-sm font-semibold text-fg">{m.tools[k].title}</span>
                <span class="mt-1 text-xs text-muted">{m.tools[k].blurb}</span>
              </A>
            )}
          </For>
        </div>
      </div>

      <p class="text-xs text-muted">{m.content.verifyNote}</p>
    </section>
  );
}
