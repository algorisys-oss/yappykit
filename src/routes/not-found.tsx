import { A } from '@solidjs/router';
import { onMount, onCleanup } from 'solid-js';
import { useI18n } from '../i18n/runtime';

/**
 * Catch-all for unknown URLs.
 *
 * Deliberately does NOT set a canonical: a 404 has no canonical URL, and
 * pointing one at a made-up /404 path (as this page used to) invites Google to
 * index a page that does not exist. It sets `noindex` instead, matching the
 * prerendered dist/404.html that the host serves with a real 404 status.
 */
export default function NotFound() {
  const { m, path } = useI18n();

  onMount(() => {
    document.title = m.notFound.seoTitle;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.appendChild(meta);
    // Drop the previous page's canonical — it does not describe this one.
    const canonical = document.head.querySelector('link[rel="canonical"]');
    canonical?.remove();
    onCleanup(() => meta.remove());
  });

  return (
    <main class="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
      <p class="text-5xl font-bold text-accent">404</p>
      <h1 class="mt-4 text-2xl font-bold">{m.notFound.h1}</h1>
      <p class="mt-2 max-w-prose text-sm text-muted">{m.notFound.body}</p>
      <A
        href={path('home')}
        class="mt-8 inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg no-underline"
      >
        {m.notFound.cta}
      </A>
    </main>
  );
}
