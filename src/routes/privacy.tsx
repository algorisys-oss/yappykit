import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { useSeo } from '../lib/seo';
import {
  PRIVACY_LEAD,
  PRIVACY_SECTIONS,
  PRIVACY_UPDATED,
  emphasise,
  type PrivacySection,
} from '../content/privacy';

/**
 * Privacy Policy — a Read surface, and a hard requirement for AdSense approval
 * (docs/07) and for the brand's core claim (docs/08).
 *
 * The words live in ../content/privacy so the prerenderer emits exactly the
 * same text. That is not tidiness: this page used to be JSX only and the
 * prerenderer skipped its body outright, so the static HTML shipped a heading
 * and no policy. NO component-library JS here, as with the other content pages.
 *
 * The operator is in Mumbai, Maharashtra, India, so the DPDP Act 2023 is the
 * law that governs us; other regimes are named as additional rights a visitor
 * may hold, not as claims about who we are. The contact address is live and
 * monitored. Still worth a lawyer's read before it carries real weight.
 */
function Paragraph(props: { text: string }) {
  return (
    <p class="mt-2">
      <For each={emphasise(props.text)}>
        {(part) => (part.em ? <em>{part.text}</em> : <>{part.text}</>)}
      </For>
    </p>
  );
}

function Section(props: { section: PrivacySection }) {
  const s = () => props.section;
  return (
    <section id={s().id}>
      <h2 class="text-lg font-semibold">{s().heading}</h2>

      <For each={s().paragraphs}>{(p) => <Paragraph text={p} />}</For>

      <Show when={s().table}>
        {(table) => (
          <div class="mt-3 overflow-x-auto rounded border border-border">
            <table class="w-full text-left">
              <thead>
                <tr class="bg-surface text-muted">
                  <For each={table().columns}>
                    {(c) => <th class="px-3 py-2 font-medium">{c}</th>}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={table().rows}>
                  {(row) => (
                    <tr class="border-t border-border">
                      <For each={row}>
                        {(cell) => (
                          <td
                            class={`px-3 py-2 ${
                              cell.tone === 'good'
                                ? 'font-semibold text-success'
                                : cell.tone === 'muted'
                                  ? 'text-muted'
                                  : ''
                            }`}
                          >
                            {cell.text}
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </Show>

      <Show when={s().bullets}>
        {(items) => (
          <ul class="mt-2 list-disc space-y-1 ps-5">
            <For each={items()}>
              {(b) => (
                <li>
                  <Show when={b.label}>
                    <strong>{b.label}</strong>{' '}
                  </Show>
                  {b.text}
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>

      <Show when={s().email}>
        {(address) => (
          <p class="mt-2">
            <a class="text-accent underline" href={`mailto:${address()}`}>
              {address()}
            </a>
            .
          </p>
        )}
      </Show>
    </section>
  );
}

export default function Privacy() {
  useSeo('privacy');
  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">Privacy Policy</h1>
      <p class="mt-2 text-sm text-muted">Last updated: {PRIVACY_UPDATED}</p>

      <div class="mt-8 space-y-8 text-sm leading-relaxed text-fg">
        <section>
          <p>
            {PRIVACY_LEAD.before} <strong>{PRIVACY_LEAD.claim}</strong> {PRIVACY_LEAD.after}
          </p>
        </section>

        <For each={PRIVACY_SECTIONS}>{(s) => <Section section={s} />}</For>

        <p class="border-t border-border pt-6 text-muted">
          See also our{' '}
          <A href="/terms" class="text-accent underline">
            Terms of Use
          </A>
          , or{' '}
          <A href="/" class="text-accent underline">
            go back to YappyKit
          </A>
          .
        </p>
      </div>
    </main>
  );
}
