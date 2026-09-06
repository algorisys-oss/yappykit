import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { BatchRenamePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { zip } from '@core/archive/zip';
import { readTakenDate } from '@core/metadata/read';
import { planRename, byTakenThenName, type Scheme, type Source } from '@core/rename/plan';

/**
 * Rename a batch of images.
 *
 * The honest framing matters here more than usual: a web page cannot rename
 * files on a disk. What it can do is hand back a ZIP whose entries carry the new
 * names, and the copy says exactly that rather than implying otherwise.
 *
 * Nothing is re-encoded. The bytes of each file go into the archive untouched,
 * so this is the one image tool on the site that cannot cost any quality at all.
 */

interface Picked extends Source {
  file: File;
}

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function BatchRename() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['batch-rename'];
  const u = tt.ui;
  useSeo('batch-rename');

  const [picked, setPicked] = createSignal<Picked[]>([]);
  const [scheme, setScheme] = createSignal<Scheme>('sequence');
  const [prefix, setPrefix] = createSignal('');
  const [start, setStart] = createSignal(1);
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  onCleanup(clearResult);

  async function accept(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|heic|heif|gif|tiff?)$/i.test(f.name));
    if (!images.length) {
      setError(u.needImages);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    try {
      // The date is read once, here, rather than every time the scheme changes:
      // it is the only slow part and it does not depend on the scheme.
      const read = await Promise.all(
        images.map(async (file) => ({ file, name: file.name, taken: await readTakenDate(file) })),
      );
      setPicked(read);
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (files.length) await accept(files);
  }

  usePasteImages((files) => void accept(files));

  /** Sorted for the chosen scheme, because the order is what makes it useful. */
  const ordered = createMemo(() =>
    scheme() === 'dateTaken' ? [...picked()].sort(byTakenThenName) : picked(),
  );

  const plan = createMemo(() =>
    planRename(ordered(), { scheme: scheme(), prefix: prefix(), start: start() }),
  );

  const withoutDate = createMemo(() => plan().filter((r) => r.note === 'noDate').length);
  const collisions = createMemo(() => plan().filter((r) => r.note === 'collision').length);

  function build() {
    const rows = plan();
    const files = ordered();
    if (!rows.length) {
      setError(u.needImages);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    try {
      void (async () => {
        try {
          // Bytes are copied, never re-encoded: renaming cannot cost quality.
          const entries = await Promise.all(
            rows.map(async (row, i) => ({
              name: row.to,
              bytes: new Uint8Array(await files[i]!.file.arrayBuffer()),
            })),
          );
          const archive = zip(entries);
          setResult({
            url: URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/zip' })),
            name: 'renamed.zip',
            bytes: archive.byteLength,
          });
        } catch {
          setError(u.failed);
        } finally {
          setBusy(false);
        }
      })();
    } catch {
      setError(u.failed);
      setBusy(false);
    }
  }

  const schemes: { id: Scheme; label: string }[] = [
    { id: 'sequence', label: u.schemeSequence },
    { id: 'dateTaken', label: u.schemeDate },
    { id: 'tidy', label: u.schemeTidy },
  ];

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={BatchRenamePreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="rename-files">
            {u.pickLabel}
          </label>
          <input
            id="rename-files"
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHint}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>
        <Show when={busy() && !picked().length}>
          <p class="text-sm text-muted">{u.reading}</p>
        </Show>

        <Show when={picked().length}>
          <>
            <div>
              <label class="mb-2 block text-sm font-medium">{u.schemeLabel}</label>
              <SegmentedControl
                aria-label={u.schemeLabel}
                value={scheme()}
                onChange={(v) => {
                  clearResult();
                  setScheme(v as Scheme);
                }}
                options={schemes.map((s) => ({ value: s.id, label: s.label }))}
              />

              <Show when={scheme() !== 'tidy'}>
                <div class="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label class="mb-1 block text-xs text-muted" for="rename-prefix">
                      {u.prefixLabel}
                    </label>
                    <input
                      id="rename-prefix"
                      type="text"
                      value={prefix()}
                      placeholder={u.prefixPlaceholder}
                      onInput={(e) => {
                        clearResult();
                        setPrefix(e.currentTarget.value);
                      }}
                      class="w-48 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
                    />
                  </div>
                  <Show when={scheme() === 'sequence'}>
                    <div>
                      <label class="mb-1 block text-xs text-muted" for="rename-start">
                        {u.startLabel}
                      </label>
                      <input
                        id="rename-start"
                        type="number"
                        min="0"
                        value={start()}
                        onInput={(e) => {
                          clearResult();
                          setStart(Number(e.currentTarget.value) || 0);
                        }}
                        class="w-24 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
                      />
                    </div>
                  </Show>
                </div>
              </Show>

              <p class="mt-2 text-xs text-muted">
                {scheme() === 'dateTaken' ? u.dateNote : scheme() === 'tidy' ? u.tidyNote : u.sequenceNote}
              </p>
            </div>

            <div>
              <h2 class="mb-2 text-sm font-medium">{u.previewHeading}</h2>
              <ul class="m-0 list-none space-y-1 p-0 text-xs">
                <For each={plan()}>
                  {(row) => (
                    <li class="flex flex-wrap items-baseline gap-2 rounded border border-border bg-surface px-3 py-2">
                      <span class="font-mono text-muted line-through">{row.from}</span>
                      <span aria-hidden="true" class="text-muted">
                        &rarr;
                      </span>
                      <span class="font-mono text-fg">{row.to}</span>
                      <Show when={row.note === 'noDate'}>
                        <span class="text-warning-soft-fg">{u.noteNoDate}</span>
                      </Show>
                      <Show when={row.note === 'collision'}>
                        <span class="text-warning-soft-fg">{u.noteCollision}</span>
                      </Show>
                      <Show when={row.note === 'unchanged'}>
                        <span class="text-muted">{u.noteUnchanged}</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={withoutDate()}>
                <p class="mt-2 text-xs text-warning-soft-fg">
                  {fmt(withoutDate() === 1 ? u.noDateOne : u.noDateMany, { n: withoutDate() })}
                </p>
              </Show>
              <Show when={collisions()}>
                <p class="mt-2 text-xs text-warning-soft-fg">
                  {fmt(collisions() === 1 ? u.collisionOne : u.collisionMany, { n: collisions() })}
                </p>
              </Show>
              <p class="mt-2 text-xs text-muted">{u.zipNote}</p>
            </div>

            <Button onClick={build} disabled={busy()}>
              {busy() ? u.working : fmt(u.action, { n: plan().length })}
            </Button>
          </>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(u.doneStatus, { n: plan().length, size: kb(r().bytes) })}
              </p>
              <div>
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {u.download}
                </a>
              </div>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="batch-rename" />
    </main>
  );
}
