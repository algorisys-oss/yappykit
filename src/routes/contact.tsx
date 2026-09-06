import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { useSeo } from '../lib/seo';
import { useI18n } from '../i18n/runtime';
import { SUPPORT_EMAIL } from '../content/contact';

/**
 * Contact — a Read surface, and the page a reviewer looks for first.
 *
 * Localized, unlike the policy pages: this is short, safely translatable copy,
 * and someone reading the site in German who wants to report a bug should not
 * be handed an English page to do it.
 *
 * The "what we cannot do" section is not padding. Every item on it is a request
 * that is impossible because of how the site is built rather than because of a
 * policy, and answering those once here is both more honest and less work than
 * answering them one email at a time. No component-library JS, as with the
 * other content pages.
 */
export default function Contact() {
  const { m } = useI18n();
  const c = m.contact;
  useSeo('contact');

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <h1 class="text-3xl font-bold">{c.h1}</h1>
      <p class="mt-4 max-w-prose text-lg text-muted">{c.intro}</p>

      <div class="mt-10 space-y-10 text-sm leading-relaxed text-fg">
        <section>
          <h2 class="text-xl font-bold">{c.emailHeading}</h2>
          <p class="mt-3 max-w-prose">
            <a href={`mailto:${SUPPORT_EMAIL}`} class="text-accent underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p class="mt-3 max-w-prose">{c.emailBody}</p>
        </section>

        <section>
          <h2 class="text-xl font-bold">{c.goodHeading}</h2>
          <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5">
            <For each={c.goodPoints}>{(p) => <li>{p}</li>}</For>
          </ul>
        </section>

        <section>
          <h2 class="text-xl font-bold">{c.expectHeading}</h2>
          <p class="mt-3 max-w-prose">{c.expectBody}</p>
        </section>

        <section>
          <h2 class="text-xl font-bold">{c.cannotHeading}</h2>
          <p class="mt-3 max-w-prose">{c.cannotBody}</p>
          <ul class="mt-3 max-w-prose list-disc space-y-1 ps-5">
            <For each={c.cannotPoints}>{(p) => <li>{p}</li>}</For>
          </ul>
        </section>

        <section>
          <h2 class="text-xl font-bold">{c.operatorHeading}</h2>
          <p class="mt-3 max-w-prose">{c.operatorBody}</p>
        </section>

        <p class="border-t border-border pt-6 text-muted">
          <A href="/privacy" class="text-accent underline">
            Privacy Policy
          </A>
          {' · '}
          <A href="/terms" class="text-accent underline">
            Terms of Use
          </A>
        </p>
      </div>
    </main>
  );
}
