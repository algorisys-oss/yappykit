import { A } from '@solidjs/router';
import { For, createMemo } from 'solid-js';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { toolList } from '../lib/tools';

/**
 * About — the product story and the mechanism, in plain language. A Read surface
 * and a content/SEO page. No component-library JS. Drawn from docs/01 (vision)
 * and docs/08 (privacy positioning).
 */
export default function About() {
  const { m, locale, parts, path } = useI18n();
  const a = m.about;
  useSeo('about');
  const tools = createMemo(() => toolList(m, locale));

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">{a.h1}</h1>
      <p class="mt-4 max-w-prose text-lg text-muted">{a.intro}</p>

      <div class="mt-10 space-y-10 text-sm leading-relaxed text-fg">
        {/* Kept in step with the `who-we-are` section in content/terms and
            content/privacy: three pages naming three different operators is
            worse than not saying at all. */}
        <section>
          <h2 class="text-xl font-bold">{a.whoHeading}</h2>
          <p class="mt-3 max-w-prose text-sm leading-relaxed text-fg">{a.whoBody}</p>
        </section>

        <section>
          <h2 class="text-xl font-bold">{a.whyHeading}</h2>
          <p class="mt-3 max-w-prose">{a.whyBody1}</p>
          <p class="mt-3 max-w-prose">{a.whyBody2}</p>
        </section>

        <section>
          <h2 class="text-xl font-bold">{a.howHeading}</h2>
          <p class="mt-3 max-w-prose">
            <For each={parts(a.howBody1)}>
              {(p) =>
                'text' in p ? (
                  <>{p.text}</>
                ) : (
                  <strong>{p.token === 'file' ? a.howBody1File : a.howBody1Page}</strong>
                )
              }
            </For>
          </p>
          <p class="mt-3 max-w-prose">{a.howBody2}</p>
        </section>

        <section>
          <h2 class="text-xl font-bold">{a.isHeading}</h2>
          <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5">
            <For each={a.isPoints}>{(p) => <li>{p}</li>}</For>
          </ul>
        </section>

        <section>
          <h2 class="text-xl font-bold">{a.toolsHeading}</h2>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <For each={tools()}>
              {(t) => (
                <A
                  href={t.href}
                  class="flex flex-col rounded-lg border border-border bg-surface p-4 no-underline transition hover:border-accent"
                >
                  <span class="text-sm font-semibold text-fg">{t.title}</span>
                  <span class="mt-1 text-xs text-muted">{t.blurb}</span>
                </A>
              )}
            </For>
          </div>
        </section>

        <p class="border-t border-border pt-6 text-muted">
          <For each={parts(a.outro)}>
            {(p) =>
              'text' in p ? (
                <>{p.text}</>
              ) : p.token === 'privacy' ? (
                <A href="/privacy" class="text-accent underline">{a.outroPrivacy}</A>
              ) : (
                <A href={path('home')} class="text-accent underline">{a.outroBrowse}</A>
              )
            }
          </For>
        </p>
      </div>
    </main>
  );
}
