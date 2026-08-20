import { A } from '@solidjs/router';
import { For, Show, createMemo, type JSX } from 'solid-js';
import { TOOL_PREVIEWS } from './tool-previews';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { toolList, type Tool } from '../lib/tools';

/**
 * Landing / content page — the SEO asset and the first impression.
 *
 * BUDGET RULE: NO component library here. Solid + the router is the entire JS
 * cost (`npm run budget` gates it at 100 KB gz). Colours are the shared
 * --zen-color-* tokens, so it matches the tool UIs and the Yappy family.
 *
 * The copy leans on the real differentiators from the brief: private by
 * architecture (files never leave the device), outcome-driven, and offline —
 * and it invites verification, which the privacy doc calls the strongest form
 * of the claim.
 *
 * The site-wide footer lives in the root layout, not here — every page needs the
 * Privacy Policy link, not just this one.
 */

const YAPPYDRAW_URL = 'https://yappydraw.com';

const ICONS: JSX.Element[] = [<ShieldIcon />, <BoltIcon />, <PlugIcon />];

export default function Landing() {
  const { m, locale, parts } = useI18n();
  const l = m.landing;
  useSeo('home');
  const tools = createMemo(() => toolList(m, locale));

  return (
    <main>
      {/* Hero */}
      <section class="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(60% 60% at 20% 0%, color-mix(in srgb, var(--zen-color-primary) 16%, transparent), transparent 70%)',
          }}
        />
        <div class="relative mx-auto max-w-4xl px-6 py-20 sm:py-28">
          <p class="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span class="inline-block h-2 w-2 rounded-full bg-success" /> {l.badge}
          </p>
          <h1 class="mt-5 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            {l.h1}
          </h1>
          <p class="mt-5 max-w-2xl text-lg text-muted sm:text-xl">{l.sub}</p>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <A
              href={tools()[0]!.href}
              class="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg no-underline shadow-sm transition hover:opacity-90"
            >
              {l.ctaOpen}
            </A>
            <a
              href="#how"
              class="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-fg no-underline transition hover:border-accent"
            >
              {l.ctaHow}
            </a>
          </div>
          <ul class="mt-8 flex list-none flex-wrap gap-2 p-0 text-sm">
            <For each={l.claims}>
              {(claim) => (
                <li class="rounded-full border border-border bg-surface px-3 py-1 text-muted">✓ {claim}</li>
              )}
            </For>
          </ul>
        </div>
      </section>

      {/* Value props */}
      <section aria-labelledby="why" class="mx-auto max-w-4xl px-6 py-16">
        <h2 id="why" class="sr-only">{l.whyHeading}</h2>
        <div class="grid gap-6 sm:grid-cols-3">
          <For each={l.valueProps}>
            {(v, i) => (
              <div class="rounded-lg border border-border bg-surface p-5">
                <div class="text-accent">{ICONS[i()]}</div>
                <h3 class="mt-3 font-semibold text-fg">{v.title}</h3>
                <p class="mt-1 text-sm text-muted">{v.body}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      {/* Tools */}
      <section aria-labelledby="tools" class="mx-auto max-w-4xl px-6 pb-16">
        <h2 id="tools" class="text-2xl font-bold">{l.toolsHeading}</h2>
        <p class="mt-1 text-muted">{l.toolsSub}</p>
        <div class="mt-6 grid gap-4 sm:grid-cols-2">
          <For each={tools()}>{(tool) => <ToolCard tool={tool} />}</For>
        </div>
      </section>

      {/* How it works */}
      <section id="how" class="border-t border-border bg-surface/50">
        <div class="mx-auto max-w-4xl px-6 py-16">
          <h2 class="text-2xl font-bold">{l.howHeading}</h2>
          <p class="mt-1 max-w-2xl text-muted">
            <For each={parts(l.howSub)}>
              {(p) =>
                'text' in p ? (
                  <>{p.text}</>
                ) : (
                  <strong class="text-fg">{p.token === 'file' ? l.howSubFile : l.howSubPage}</strong>
                )
              }
            </For>
          </p>
          <ol class="mt-8 grid list-none gap-6 p-0 sm:grid-cols-3">
            <For each={l.howSteps}>
              {(s, i) => (
                <li>
                  <div class="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg">
                    {i() + 1}
                  </div>
                  <h3 class="mt-3 font-semibold text-fg">{s.t}</h3>
                  <p class="mt-1 text-sm text-muted">{s.d}</p>
                </li>
              )}
            </For>
          </ol>
          <div class="mt-8 border-s-2 border-accent ps-4">
            <p class="max-w-2xl text-sm text-fg">
              <strong>{l.checkLabel}</strong> {l.checkBody}
            </p>
          </div>
        </div>
      </section>

      {/* Sister product — YappyDraw. A genuine cross-link between our own
          properties; opens in a new tab because it is a separate application. */}
      <section class="border-t border-border">
        <div class="mx-auto max-w-4xl px-6 py-16">
          <h2 class="text-2xl font-bold">{l.sisterHeading}</h2>
          <p class="mt-2 max-w-2xl text-muted">{l.sisterBody}</p>
          <ul class="mt-4 max-w-2xl list-disc space-y-1 ps-5 text-sm text-muted">
            <For each={l.sisterFeatures}>{(f) => <li>{f}</li>}</For>
          </ul>
          <a
            href={YAPPYDRAW_URL}
            target="_blank"
            rel="noopener"
            class="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-fg no-underline transition hover:border-accent"
          >
            {l.sisterCta}
            <span aria-hidden="true">↗</span>
            <span class="sr-only">{l.sisterNewWindow}</span>
          </a>
        </div>
      </section>
    </main>
  );
}

function ToolCard(props: { tool: Tool }) {
  const Preview = TOOL_PREVIEWS[props.tool.key];
  return (
    <A
      href={props.tool.href}
      class="group relative flex flex-col rounded-lg border p-5 no-underline transition-all duration-150 cursor-pointer overflow-hidden border-border bg-surface shadow-sm hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
    >
      <Show when={Preview}>
        {(P) => (
          <div class="-mx-5 -mt-5 mb-4 flex h-28 items-center justify-center border-b border-border px-8 py-4">
            {P()()}
          </div>
        )}
      </Show>
      <span class="flex items-center justify-between gap-2">
        <span class="font-semibold text-fg">{props.tool.title}</span>
        <span aria-hidden="true" class="text-accent transition-transform duration-150 group-hover:translate-x-1">
          →
        </span>
      </span>
      <span class="mt-1 text-sm text-muted">{props.tool.blurb}</span>
    </A>
  );
}

/* Inline icons — no icon-font dependency, currentColor so they theme for free. */
function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
function PlugIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 22v-5" />
      <path d="M9 8V2M15 8V2" />
      <path d="M5 8h14v3a7 7 0 0 1-14 0V8z" />
    </svg>
  );
}
