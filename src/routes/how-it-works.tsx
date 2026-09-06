import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { useSeo } from '../lib/seo';
import {
  EXPLAINER_INTRO,
  EXPLAINER_SECTIONS,
  EXPLAINER_UPDATED,
} from '../content/how-it-works';

/**
 * How it works — the technical explainer every tool's privacy claim points at.
 *
 * The words live in ../content/how-it-works so the prerenderer emits exactly the
 * same text. That matters more here than on most pages: this is the page that
 * substantiates the site's central claim, so it has to be readable with
 * JavaScript switched off, by a crawler, and by anyone who does not trust the
 * claim enough to run our code.
 *
 * A table of contents is generated from the section ids rather than written by
 * hand, so it cannot fall out of step with the sections.
 */
export default function HowItWorks() {
  useSeo('how-it-works');
  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">How YappyKit works</h1>
      <p class="mt-4 max-w-prose text-lg text-muted">{EXPLAINER_INTRO}</p>
      <p class="mt-4 text-sm text-muted">Last updated: {EXPLAINER_UPDATED}</p>

      <nav class="mt-8 rounded border border-border bg-surface p-4" aria-label="On this page">
        <h2 class="text-sm font-semibold">On this page</h2>
        <ul class="mt-2 space-y-1 text-sm">
          <For each={EXPLAINER_SECTIONS}>
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
        <For each={EXPLAINER_SECTIONS}>
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
            </section>
          )}
        </For>

        <p class="border-t border-border pt-6 text-muted">
          See our{' '}
          <A href="/privacy" class="text-accent underline">
            Privacy Policy
          </A>{' '}
          for what the page itself does, or{' '}
          <A href="/" class="text-accent underline">
            browse the tools
          </A>
          .
        </p>
      </div>
    </main>
  );
}
