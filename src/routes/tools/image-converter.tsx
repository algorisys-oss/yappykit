import { createSignal, onCleanup, onMount, Show, For } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ImageConvertPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { zip, uniqueNames } from '@core/archive/zip';
import { convert, outputName, supportedOutputs, type OutputFormat } from '@core/image/convert';

/**
 * Image format converter.
 *
 * The outcome people want is "a file this site will accept", so the only
 * control is the format. Resolution is never touched: a converter that also
 * quietly resized would break the one job it has.
 *
 * The format list is what the browser proved it can encode, not what it was
 * asked to encode. See core/image/convert for why the difference matters.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

interface Result {
  name: string;
  url: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export default function ImageConverter() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['image-convert'];
  const u = tt.ui;
  useSeo('image-convert');

  const byName = new Intl.Collator(undefined, { numeric: true });
  const [files, setFiles] = createSignal<File[]>([]);
  const [formats, setFormats] = createSignal<OutputFormat[]>(['image/jpeg', 'image/png']);
  const [target, setTarget] = createSignal<OutputFormat>('image/jpeg');
  const [results, setResults] = createSignal<Result[]>([]);
  const [archive, setArchive] = createSignal<{ url: string; bytes: number } | null>(null);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    void supportedOutputs().then((available) => {
      if (available.length === 0) return;
      setFormats(available);
      if (!available.includes(target())) setTarget(available[0]!);
    });
  });

  const label = (format: OutputFormat) =>
    format === 'image/jpeg'
      ? u.formatJpeg
      : format === 'image/png'
        ? u.formatPng
        : format === 'image/webp'
          ? u.formatWebp
          : u.formatAvif;

  const clearResults = () => {
    for (const r of results()) URL.revokeObjectURL(r.url);
    const a = archive();
    if (a) URL.revokeObjectURL(a.url);
    setResults([]);
    setArchive(null);
  };
  onCleanup(clearResults);

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const picked = [...(e.currentTarget.files ?? [])];
    // Clearing the input lets the same file be chosen again after a conversion.
    e.currentTarget.value = '';
    accept(picked);
  }

  usePasteImages((incoming) => accept(incoming));

  function accept(incoming: File[]) {
    if (incoming.length === 0) return;
    clearResults();
    setError('');
    setSkipped([]);
    setFiles([...files(), ...incoming].sort((a, b) => byName.compare(a.name, b.name)));
  }

  async function run() {
    const chosen = files();
    if (chosen.length === 0) {
      setError(u.needFiles);
      return;
    }
    clearResults();
    setError('');
    setSkipped([]);
    setBusy(true);
    const format = target();
    const done: Result[] = [];
    const rejected: string[] = [];
    try {
      for (const file of chosen) {
        try {
          const out = await convert(file, format);
          done.push({
            name: outputName(file.name, format),
            url: URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: format })),
            bytes: out.bytes,
            width: out.width,
            height: out.height,
          });
        } catch {
          rejected.push(fmt(u.unreadable, { name: file.name }));
        }
      }
      const names = uniqueNames(done.map((d) => d.name));
      names.forEach((name, i) => (done[i]!.name = name));
      setResults(done);
      setSkipped(rejected);

      if (done.length > 1) {
        const bytes = zip(done.map((d) => ({ name: d.name, bytes: d.bytes })));
        setArchive({
          url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' })),
          bytes: bytes.byteLength,
        });
      }
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = () => results().reduce((sum, r) => sum + r.bytes.byteLength, 0);

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ImageConvertPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="convert-files">
            {u.pickLabel}
          </label>
          <input
            id="convert-files"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHint}</p>
          <Show when={files().length > 0}>
            <p class="mt-2 text-xs text-muted">{files().map((f) => f.name).join(', ')}</p>
          </Show>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">{u.formatLabel}</label>
          <SegmentedControl
            aria-label={u.formatLabel}
            options={formats().map((f) => ({ value: f, label: label(f) }))}
            value={target()}
            onChange={setTarget}
          />
          <p class="mt-2 text-xs text-muted">{u.formatNote}</p>
          <Show when={target() === 'image/jpeg'}>
            <p class="mt-1 text-xs text-muted">{u.transparencyNote}</p>
          </Show>
          <p class="mt-1 text-xs text-muted">{u.sizeNote}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Button onClick={() => void run()} disabled={busy()}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={skipped().length > 0}>
          <ul class="list-none space-y-1 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            <For each={skipped()}>{(line) => <li>{line}</li>}</For>
          </ul>
        </Show>

        <Show when={results().length > 0}>
          <div class="space-y-3">
            <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
              {fmt(u.doneStatus, { n: results().length, size: kb(totalBytes()) })}
            </p>
            <p class="text-sm font-medium">{u.listHeading}</p>
            <ul class="list-none space-y-2 p-0">
              <For each={results()}>
                {(r) => (
                  <li class="flex items-center justify-between gap-3 rounded border border-border bg-surface p-3">
                    <span class="min-w-0">
                      <span class="block truncate text-sm text-fg">{r.name}</span>
                      <span class="block text-xs text-muted">
                        {fmt(u.rowMeta, {
                          dimensions: fmt(u.dimensions, { width: r.width, height: r.height }),
                          size: kb(r.bytes.byteLength),
                        })}
                      </span>
                    </span>
                    <a
                      href={r.url}
                      download={r.name}
                      class="shrink-0 rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg no-underline"
                    >
                      {u.download}
                    </a>
                  </li>
                )}
              </For>
            </ul>
            <Show when={archive()}>
              {(a) => (
                <a
                  href={a().url}
                  download="converted.zip"
                  class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg no-underline"
                >
                  {u.downloadAll} ({kb(a().bytes)})
                </a>
              )}
            </Show>
          </div>
        </Show>
      </div>
      <ToolContent route="image-convert" />
    </main>
  );
}
