import { createSignal, Show, For } from 'solid-js';
import ToolHero from '../../components/ToolHero';
import { FileInspectPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, anyFile } from '../../lib/paste';
import { inspect, type Finding, type Inspection } from '@core/inspect';

/**
 * File Inspector.
 *
 * Two questions, in the order people ask them: what is this file really, and
 * what is it carrying? The first is answered from the leading bytes, which is
 * the only trustworthy source (a name is a claim, and a wrong one is the usual
 * cause of a rejected upload). The second is whatever the format lets us read
 * without unpacking or decrypting anything.
 *
 * Findings arrive from core/inspect as codes rather than sentences, because
 * every sentence here is translated.
 */

const kb = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function FileInspector() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['file-inspect'];
  const u = tt.ui;
  useSeo('file-inspect');
  const [report, setReport] = createSignal<Inspection | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (file) await accept(file);
  }

  usePasteFiles(anyFile, (files) => void accept(files[0]!));

  async function accept(file: File) {
    setError('');
    setReport(null);
    setBusy(true);
    try {
      setReport(await inspect(file));
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  /** The sentence for a finding, with the values it needs filled in. */
  function findingText(r: Inspection, code: Finding): string {
    if (code === 'mismatch') {
      return fmt(u.mismatch, { actual: r.format?.format ?? '', claimed: r.claimedExt });
    }
    return u[code];
  }

  const typeText = (r: Inspection) =>
    r.format ? fmt(u.typeValue, { format: r.format.format, mime: r.format.mime }) : u.unknownFormat;

  const kindText = (r: Inspection) =>
    r.zip?.kind === 'office' ? u.kindOffice : r.zip?.kind === 'epub' ? u.kindEpub : u.kindArchive;

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={FileInspectPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="inspect-file">
            {u.pickLabel}
          </label>
          <input
            id="inspect-file"
            type="file"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={busy()}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={report()}>
          {(r) => (
            <div class="space-y-6">
              <section>
                <h2 class="mb-2 text-sm font-medium">{u.factsHeading}</h2>
                <div class="overflow-hidden rounded border border-border">
                  <table class="w-full text-sm">
                    <tbody>
                      <tr class="border-b border-border">
                        <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.nameLabel}</td>
                        <td class="break-all px-3 py-2 text-fg">{r().name}</td>
                      </tr>
                      <tr class="border-b border-border">
                        <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.typeLabel}</td>
                        <td class="px-3 py-2 text-fg">{typeText(r())}</td>
                      </tr>
                      <tr class="border-b border-border last:border-0">
                        <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.sizeLabel}</td>
                        <td class="px-3 py-2 text-fg">{kb(r().sizeBytes)}</td>
                      </tr>
                      <Show when={r().dimensions}>
                        {(d) => (
                          <tr class="border-t border-border">
                            <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.dimensionsLabel}</td>
                            <td class="px-3 py-2 text-fg">
                              {fmt(u.dimensionsValue, { width: d().width, height: d().height })}
                            </td>
                          </tr>
                        )}
                      </Show>
                      <Show when={r().pdf}>
                        {(p) => (
                          <tr class="border-t border-border">
                            <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.pagesLabel}</td>
                            <td class="px-3 py-2 text-fg">{p().pageCount}</td>
                          </tr>
                        )}
                      </Show>
                      <Show when={r().zip}>
                        {(z) => (
                          <tr class="border-t border-border">
                            <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{u.entriesLabel}</td>
                            <td class="px-3 py-2 text-fg">
                              {fmt(u.entriesValue, { n: z().entryCount })}. {kindText(r())}
                            </td>
                          </tr>
                        )}
                      </Show>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 class="mb-2 text-sm font-medium">{u.findingsHeading}</h2>
                <Show
                  when={r().findings.length > 0}
                  fallback={
                    <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg">{u.clean}</p>
                  }
                >
                  <ul class="list-none space-y-2 p-0">
                    <For each={r().findings}>
                      {(code) => (
                        <li
                          class={`rounded border p-3 text-sm text-fg ${
                            code === 'unknownType'
                              ? 'border-border bg-surface'
                              : 'border-danger bg-danger-soft'
                          }`}
                        >
                          {findingText(r(), code)}
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>

              <Show when={r().fields.length > 0}>
                <section>
                  <h2 class="mb-2 text-sm font-medium">{u.detailsHeading}</h2>
                  <div class="overflow-hidden rounded border border-border">
                    <table class="w-full text-sm">
                      <tbody>
                        <For each={r().fields}>
                          {(f) => (
                            <tr class="border-b border-border last:border-0">
                              <td class="w-40 bg-surface px-3 py-2 font-medium text-muted">{f.label}</td>
                              <td class={`px-3 py-2 ${f.sensitive ? 'font-semibold text-danger' : 'text-fg'}`}>
                                {f.value}
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </section>
              </Show>

              <p class="text-xs text-muted">{u.privacyNote}</p>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="file-inspect" />
    </main>
  );
}
