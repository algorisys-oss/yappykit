import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '../i18n/runtime';
import { VERSION, COMMIT } from '../version';
import { RELEASES } from '../content/releases';
import { refreshApp } from '../lib/sw';

/**
 * The version, and what is in it.
 *
 * This rides in the footer, which rides on the landing page, so it imports
 * nothing from the component library and draws its own disclosure: the landing
 * bundle is budget-gated and zen-ui is not allowed near it.
 *
 * The notes are English only (see content/releases). The controls around them
 * are translated, because "refresh" and "what changed" are worth reading in
 * your own language and a list of technical changes is not worth guessing at.
 */
export default function VersionBadge() {
  const { m } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const refresh = () => {
    setBusy(true);
    void refreshApp();
  };

  return (
    <div class="text-xs text-muted">
      <button
        type="button"
        onClick={() => setOpen(!open())}
        aria-expanded={open()}
        aria-controls="version-notes"
        class="m-0 cursor-pointer appearance-none border-0 bg-transparent p-0 font-mono text-xs text-muted underline hover:text-accent"
      >
        v{VERSION}
      </button>

      <Show when={open()}>
        <div
          id="version-notes"
          class="mt-3 max-w-2xl rounded border border-border bg-surface p-4 text-start"
        >
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              disabled={busy()}
              class="cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy() ? m.common.versionRefreshing : m.common.versionRefresh}
            </button>
            <span class="text-xs text-muted">{m.common.versionRefreshHint}</span>
          </div>

          <Show when={COMMIT}>
            <p class="m-0 mb-3 font-mono text-xs text-muted">{COMMIT}</p>
          </Show>

          <For each={RELEASES}>
            {(r) => (
              <section class="mb-3 last:mb-0">
                <h3 class="m-0 text-sm font-semibold text-fg">
                  {r.version} <span class="font-normal text-muted">· {r.date}</span>
                </h3>
                <Show when={r.added?.length}>
                  <p class="mb-1 mt-2 text-xs font-medium text-fg">{m.common.versionAdded}</p>
                  <ul class="m-0 list-disc space-y-1 ps-5 text-xs leading-relaxed text-muted">
                    <For each={r.added}>{(line) => <li>{line}</li>}</For>
                  </ul>
                </Show>
                <Show when={r.fixed?.length}>
                  <p class="mb-1 mt-2 text-xs font-medium text-fg">{m.common.versionFixed}</p>
                  <ul class="m-0 list-disc space-y-1 ps-5 text-xs leading-relaxed text-muted">
                    <For each={r.fixed}>{(line) => <li>{line}</li>}</For>
                  </ul>
                </Show>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
