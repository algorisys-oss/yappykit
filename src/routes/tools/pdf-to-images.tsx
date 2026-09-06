import { createSignal, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { PdfToImagesPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, isPdf } from '../../lib/paste';
import { zip } from '@core/archive/zip';
import { pdfToImages, dpiFor, type ImageType, type OutputKind, type PageImage } from '@core/pdf/to-images';

/**
 * PDF to images.
 *
 * The control is what the pictures are for, not the resolution: "for printing"
 * is something a person knows about their own situation and 300 DPI is not.
 * Pages are rendered at the resolution that follows, one at a time, so a long
 * document costs one page of memory rather than all of them.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function PdfToImagesTool() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['pdf-to-images'];
  const u = tt.ui;
  useSeo('pdf-to-images');

  const [file, setFile] = createSignal<File | null>(null);
  const [kind, setKind] = createSignal<OutputKind>('screen');
  const [type, setType] = createSignal<ImageType>('image/jpeg');
  const [images, setImages] = createSignal<Array<PageImage & { url: string }>>([]);
  const [archive, setArchive] = createSignal<{ url: string; bytes: number } | null>(null);
  const [progress, setProgress] = createSignal(0);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const clearResults = () => {
    for (const i of images()) URL.revokeObjectURL(i.url);
    const a = archive();
    if (a) URL.revokeObjectURL(a.url);
    setImages([]);
    setArchive(null);
  };
  onCleanup(clearResults);

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const picked = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (picked) accept(picked);
  }

  usePasteFiles(isPdf, (files) => accept(files[0]!));

  function accept(picked: File) {
    clearResults();
    setError('');
    setProgress(0);
    setFile(picked);
  }

  async function run() {
    const source = file();
    if (!source) {
      setError(u.needFile);
      return;
    }
    clearResults();
    setError('');
    setBusy(true);
    setProgress(0);
    try {
      const pages = await pdfToImages(source, { kind: kind(), type: type(), quality: 0.92 }, setProgress);
      setImages(pages.map((p) => ({ ...p, url: URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: type() })) })));
      if (pages.length > 1) {
        const bytes = zip(pages.map((p) => ({ name: p.name, bytes: p.bytes })));
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

  const totalBytes = () => images().reduce((sum, i) => sum + i.bytes.byteLength, 0);

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={PdfToImagesPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="to-images-file">
            {u.pickLabel}
          </label>
          <input
            id="to-images-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
          <Show when={file()}>
            {(f) => <p class="mt-2 text-xs text-muted">{f().name}, {kb(f().size)}</p>}
          </Show>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">{u.kindLabel}</label>
          <SegmentedControl
            aria-label={u.kindLabel}
            options={[
              { value: 'screen' as const, label: u.kindScreen },
              { value: 'print' as const, label: u.kindPrint },
            ]}
            value={kind()}
            onChange={setKind}
          />
          <p class="mt-2 text-xs text-muted">{fmt(u.kindNote, { dpi: dpiFor(kind()) })}</p>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">{u.formatLabel}</label>
          <SegmentedControl
            aria-label={u.formatLabel}
            options={[
              { value: 'image/jpeg' as const, label: u.formatJpeg },
              { value: 'image/png' as const, label: u.formatPng },
            ]}
            value={type()}
            onChange={setType}
          />
          <p class="mt-2 text-xs text-muted">{u.formatNote}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Button onClick={() => void run()} disabled={busy()}>
          {busy() ? fmt(u.working, { percent: Math.round(progress() * 100) }) : u.action}
        </Button>

        <Show when={images().length > 0}>
          <div class="space-y-3">
            <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
              {fmt(u.doneStatus, { n: images().length, size: kb(totalBytes()) })}
            </p>
            <Show when={archive()}>
              {(a) => (
                <a
                  href={a().url}
                  download={`${(file()?.name ?? 'pages').replace(/\.pdf$/i, '')}-pages.zip`}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.downloadAll, { size: kb(a().bytes) })}
                </a>
              )}
            </Show>
            <ul class="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
              <For each={images()}>
                {(img) => (
                  <li class="rounded border border-border bg-surface p-2">
                    <img src={img.url} alt={img.name} class="block w-full rounded" loading="lazy" />
                    <p class="mt-2 truncate text-xs text-fg">{img.name}</p>
                    <p class="text-xs text-muted">
                      {img.width} x {img.height}, {kb(img.bytes.byteLength)}
                    </p>
                    <a
                      href={img.url}
                      download={img.name}
                      class="mt-2 inline-block text-xs font-medium text-accent no-underline"
                    >
                      {u.download}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
      <ToolContent route="pdf-to-images" />
    </main>
  );
}
