import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { useSeo } from '../lib/seo';
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '../content/terms';

/**
 * Terms of Use — a Read surface and an AdSense prerequisite (docs/07).
 *
 * The words live in ../content/terms so the prerenderer emits exactly the same
 * text: a legal page must be readable without JavaScript, and the two copies
 * must not be able to drift apart. NO component-library JS here, as with the
 * other content pages.
 */
export default function Terms() {
  useSeo('terms');
  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">Terms of Use</h1>
      <p class="mt-2 text-sm text-muted">Last updated: {TERMS_UPDATED}</p>

      <div class="mt-8 space-y-8 text-sm leading-relaxed text-fg">
        <section>
          <p>{TERMS_INTRO}</p>
        </section>

        <For each={TERMS_SECTIONS}>
          {(sec) => (
            <section id={sec.id}>
              <h2 class="text-lg font-semibold">{sec.heading}</h2>
              <For each={sec.paragraphs}>{(p) => <p class="mt-2">{p}</p>}</For>
              <Show when={sec.bullets}>
                {(items) => (
                  <ul class="mt-3 list-disc space-y-1 ps-5">
                    <For each={items()}>{(b) => <li>{b}</li>}</For>
                  </ul>
                )}
              </Show>
            </section>
          )}
        </For>

        <p class="border-t border-border pt-6 text-muted">
          See also our{' '}
          <A href="/privacy" class="text-accent underline">
            Privacy Policy
          </A>
          , or{' '}
          <A href="/" class="text-accent underline">
            browse the tools
          </A>
          .
        </p>
      </div>
    </main>
  );
}
