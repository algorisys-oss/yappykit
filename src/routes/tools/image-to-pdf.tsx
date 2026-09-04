import { createSignal, onCleanup, onMount, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { ImageToPdfPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { move } from '@core/list';
import { decodeImage, makeEncoder } from '@core/image/canvas-codec';
import {
  imageKind,
  buildImagePdf,
  pdfName,
  MARGIN_PT,
  type Paper,
  type PdfImage,
} from '@core/pdf/from-images';

/**
 * Photographs and scans into a PDF.
 *
 * One question: what should the page be. Orientation follows each picture and
 * the margin is fixed at what a printer can actually reach, because neither is
 * a decision the person uploading a payslip wants to make. See core/pdf/from-images.
 *
 * A JPEG or a PNG goes into the document untouched. Anything else, HEIC from an
 * iPhone above all, is converted here and said so — the conversion is real and
 * hiding it would be the dishonest kind of convenience.
 */


/** Good enough that a photographed page is still readable; small enough to send. */
const CONVERT_QUALITY = 0.92;

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** Phones number photographs as they are taken, so 2 must sort before 10. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface Item {
  name: string;
  sizeBytes: number;
  width: number;
  height: number;
  image: PdfImage;
  thumbUrl: string;
  /** True when the original could not be embedded as-is and was re-encoded. */
  converted: boolean;
}

/**
 * Read one file into something a PDF can hold.
 *
 * The format is sniffed from the bytes rather than the extension, because
 * phones hand over HEIC files named .jpg and a mislabelled file embedded as a
 * JPEG produces a page that opens blank instead of an error.
 */
async function loadImage(file: File): Promise<Item> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = imageKind(bytes);
  const decoded = await decodeImage(file);
  try {
    const image: PdfImage = kind
      ? { bytes, kind }
      : {
          bytes: await makeEncoder(decoded, 'image/jpeg')({ quality: CONVERT_QUALITY, scale: 1 }),
          kind: 'jpeg',
        };
    const type = image.kind === 'png' ? 'image/png' : 'image/jpeg';
    return {
      name: file.name,
      sizeBytes: file.size,
      width: decoded.width,
      height: decoded.height,
      image,
      thumbUrl: URL.createObjectURL(new Blob([image.bytes as BlobPart], { type })),
      converted: kind === null,
    };
  } finally {
    decoded.close();
  }
}

export default function ImageToPdf() {
  const { m, fmt } = useI18n();
  const tt = m.tools['image-to-pdf'];
  const u = tt.ui;
  useSeo('image-to-pdf');

  const [items, setItems] = createSignal<Item[]>([]);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [paper, setPaper] = createSignal<Paper>('a4');
  const [degraded, setDegraded] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [result, setResult] = createSignal<{ url: string; bytes: number; pages: number } | null>(
    null,
  );

  onMount(() => setDegraded(!evaluate(TOOL_CAPABILITIES['image-to-pdf'], detectCapabilities()).fastPath));

  const revoke = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(() => {
    revoke();
    for (const item of items()) URL.revokeObjectURL(item.thumbUrl);
  });

  /** Any edit to the list invalidates a PDF built from the old one. */
  const edit = (next: Item[]) => {
    revoke();
    setResult(null);
    setStatus('');
    setItems(next);
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])].sort((a, b) => byName.compare(a.name, b.name));
    // Clearing the input lets the same file be added again after it was removed.
    e.currentTarget.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setError('');
    setSkipped([]);
    setStatus(u.reading);
    const added: Item[] = [];
    const rejected: string[] = [];
    try {
      for (const file of files) {
        try {
          added.push(await loadImage(file));
        } catch {
          rejected.push(fmt(u.unreadable, { name: file.name }));
        }
      }
      edit([...items(), ...added]);
      setSkipped(rejected);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  const shift = (index: number, to: number) => edit(move(items(), index, to));

  const drop = (index: number) => {
    const gone = items()[index];
    if (gone) URL.revokeObjectURL(gone.thumbUrl);
    edit(items().filter((_, i) => i !== index));
  };

  const changePaper = (next: Paper) => {
    // The finished PDF belongs to the old paper size, so it stops being an
    // answer to the question the moment the question changes.
    revoke();
    setResult(null);
    setStatus('');
    setPaper(next);
  };

  async function run() {
    const list = items();
    setBusy(true);
    setError('');
    setStatus(u.working);
    try {
      const margin = paper() === 'image' ? 0 : MARGIN_PT;
      const bytes = await buildImagePdf(
        list.map((it) => it.image),
        paper(),
        margin,
      );
      revoke();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      setResult({ url, bytes: bytes.byteLength, pages: list.length });
      setStatus(fmt(u.doneStatus, { pages: list.length, size: kb(bytes.byteLength) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : u.failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ImageToPdfPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="image-to-pdf-files">
            {u.pickLabel}
          </label>
          <input
            id="image-to-pdf-files"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={skipped().length > 0}>
          <ul class="list-none space-y-1 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            <For each={skipped()}>{(line) => <li>{line}</li>}</For>
          </ul>
        </Show>

        <Show when={items().length > 0}>
          <div>
            <p class="mb-2 text-sm font-medium">{u.listHeading}</p>
            <ol class="list-none space-y-2 p-0">
              <For each={items()}>
                {(item, i) => (
                  <li class="flex items-center gap-3 rounded border border-border bg-surface p-3">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                      {i() + 1}
                    </span>
                    <img
                      src={item.thumbUrl}
                      alt=""
                      class="h-12 w-12 shrink-0 rounded border border-border bg-bg object-cover"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-fg">{item.name}</span>
                      <span class="block text-xs text-muted">
                        {fmt(u.rowMeta, {
                          w: item.width,
                          h: item.height,
                          size: kb(item.sizeBytes),
                        })}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={fmt(u.moveUp, { name: item.name })}
                        disabled={i() === 0}
                        onClick={() => shift(i(), i() - 1)}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        aria-label={fmt(u.moveDown, { name: item.name })}
                        disabled={i() === items().length - 1}
                        onClick={() => shift(i(), i() + 1)}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        aria-label={fmt(u.remove, { name: item.name })}
                        onClick={() => drop(i())}
                        class="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-border bg-bg text-danger"
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </span>
                  </li>
                )}
              </For>
            </ol>
            <p class="mt-2 text-xs text-muted">{fmt(u.summary, { files: items().length })}</p>
          </div>
        </Show>

        {/* The conversion is real, so it is stated rather than hidden. */}
        <Show when={items().some((it) => it.converted)}>
          <ul class="list-none space-y-1 rounded border border-border bg-surface p-3 text-sm text-muted">
            <For each={items().filter((it) => it.converted)}>
              {(item) => <li>{fmt(u.converted, { name: item.name })}</li>}
            </For>
          </ul>
        </Show>

        <div>
          <p class="mb-2 text-sm font-medium">{u.paperLabel}</p>
          <SegmentedControl
            aria-label={u.paperLabel}
            options={[
              { value: 'a4', label: u.paperA4 },
              { value: 'letter', label: u.paperLetter },
              { value: 'image', label: u.paperImage },
            ]}
            value={paper()}
            onChange={(v: string) => changePaper(v as Paper)}
          />
          <p class="mt-2 text-xs text-muted">{u.paperHint}</p>
        </div>

        <Show when={degraded()}>
          <p class="text-xs text-muted">{u.degraded}</p>
        </Show>

        <p class="text-xs text-muted">{u.losslessNote}</p>

        <Button onClick={() => void run()} disabled={busy() || items().length === 0}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-3">
              <a
                href={r().url}
                download={pdfName(items().map((it) => it.name))}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {fmt(u.download, { size: kb(r().bytes) })}
              </a>
              <p class="text-xs text-muted">{u.verifyHint}</p>
            </div>
          )}
        </Show>
      </div>

      <ToolContent route="image-to-pdf" />
    </main>
  );
}
