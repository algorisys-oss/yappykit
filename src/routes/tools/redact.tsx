import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { RedactPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles, anyFile } from '../../lib/paste';
import { decodeImage } from '@core/image/canvas-codec';
import { loadPdf, type LoadedPdf } from '@core/pdf/compress';
import { paintRedactions, pdfFromPages, redactedName } from '@core/redact/apply';
import { rectFromDrag, isDegenerate, type Point, type Rect } from '@core/redact/regions';

/**
 * Redact a document or a photo.
 *
 * The whole tool turns on one decision: the marks are not drawn over the file,
 * they are burned into pixels. A PDF is rasterised first, which discards every
 * text object it ever had, and only then are the boxes painted. That is why the
 * output has no selectable text and why the page says so rather than hiding it.
 *
 * Regions are held per page as fractions of the page, so what is drawn on a
 * preview of whatever size the screen allowed lands in the right place on the
 * full-resolution render.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

interface Loaded {
  kind: 'image' | 'pdf';
  name: string;
  /** One canvas per page. An image is a document of one page. */
  pages: HTMLCanvasElement[];
  /** Page size in PDF points, for rebuilding a document of the same shape. */
  sizes: { widthPt: number; heightPt: number }[];
  close(): void;
}

export default function Redact() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools.redact;
  const u = tt.ui;
  useSeo('redact');

  const [loaded, setLoaded] = createSignal<Loaded | null>(null);
  const [page, setPage] = createSignal(0);
  const [regions, setRegions] = createSignal<Rect[][]>([]);
  const [drag, setDrag] = createSignal<{ start: Point; current: Point } | null>(null);
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number } | null>(null);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  let surface: HTMLDivElement | undefined;

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  const reset = () => {
    clearResult();
    loaded()?.close();
    setLoaded(null);
    setRegions([]);
    setPage(0);
    setDrag(null);
  };
  onCleanup(reset);

  const current = () => regions()[page()] ?? [];
  const totalRegions = () => regions().reduce((n, list) => n + list.length, 0);
  /** "1 box" rather than "1 boxes"; the repo does the same for page counts. */
  const boxesLabel = (n: number) => (n === 1 ? u.boxesOne : fmt(u.boxesMany, { n }));

  /** The live box while the pointer is down, so the drag is visible. */
  const preview = createMemo(() => {
    const d = drag();
    return d ? rectFromDrag(d.start, d.current) : null;
  });

  function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) void accept(file);
  }

  usePasteFiles(anyFile, (files) => void accept(files[0]!));

  async function accept(file: File) {
    reset();
    setError('');
    setBusy(true);
    setStatus(u.reading);
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const pdf: LoadedPdf = await loadPdf(file, (f) =>
          setStatus(fmt(u.readingPages, { percent: Math.round(f * 100) })),
        );
        setLoaded({
          kind: 'pdf',
          name: file.name,
          pages: pdf.bitmaps,
          sizes: pdf.analysis.pages,
          close: () => pdf.close(),
        });
        setRegions(pdf.bitmaps.map(() => []));
      } else {
        const decoded = await decodeImage(file);
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        canvas.getContext('2d')?.drawImage(decoded.bitmap, 0, 0);
        decoded.close();
        setLoaded({
          kind: 'image',
          name: file.name,
          pages: [canvas],
          sizes: [{ widthPt: decoded.width, heightPt: decoded.height }],
          close: () => {},
        });
        setRegions([[]]);
      }
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  /** Pointer position as a fraction of the preview, which is what we store. */
  const pointFrom = (e: PointerEvent): Point => {
    const box = surface!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  function onPointerDown(e: PointerEvent) {
    if (!loaded()) return;
    e.preventDefault();
    surface!.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    setDrag({ start: p, current: p });
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag();
    if (!d) return;
    setDrag({ start: d.start, current: pointFrom(e) });
  }

  function onPointerUp() {
    const box = preview();
    setDrag(null);
    // A click that never became a drag is not a region; ignoring it stops a
    // stray tap adding an invisible zero-size box to the list.
    if (!box || isDegenerate(box)) return;
    clearResult();
    setRegions((all) => all.map((list, i) => (i === page() ? [...list, box] : list)));
  }

  const undo = () => {
    clearResult();
    setRegions((all) => all.map((list, i) => (i === page() ? list.slice(0, -1) : list)));
  };
  const clearPage = () => {
    clearResult();
    setRegions((all) => all.map((list, i) => (i === page() ? [] : list)));
  };

  async function run() {
    const doc = loaded();
    if (!doc) return;
    if (totalRegions() === 0) {
      setError(u.needRegion);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    setStatus(u.working);
    try {
      // Paint onto copies: the originals stay clean so the marks can be edited
      // and re-applied without the previous pass being baked in.
      const painted = doc.pages.map((source, i) => {
        const copy = document.createElement('canvas');
        copy.width = source.width;
        copy.height = source.height;
        copy.getContext('2d')?.drawImage(source, 0, 0);
        paintRedactions(copy, regions()[i] ?? []);
        return copy;
      });

      let bytes: Uint8Array;
      let type: string;
      if (doc.kind === 'pdf') {
        bytes = await pdfFromPages(
          painted.map((canvas, i) => ({ canvas, ...doc.sizes[i]! })),
        );
        type = 'application/pdf';
      } else {
        const blob = await new Promise<Blob | null>((resolve) =>
          painted[0]!.toBlob(resolve, 'image/jpeg', 0.92),
        );
        if (!blob) throw new Error('encode failed');
        bytes = new Uint8Array(await blob.arrayBuffer());
        type = 'image/jpeg';
      }

      const name = doc.kind === 'pdf' ? redactedName(doc.name) : redactedName(doc.name.replace(/\.[^.]+$/, '.jpg'));
      setResult({
        url: URL.createObjectURL(new Blob([bytes as BlobPart], { type })),
        name,
        bytes: bytes.byteLength,
      });
      for (const c of painted) {
        c.width = 0;
        c.height = 0;
      }
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={RedactPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="redact-file">
            {u.pickLabel}
          </label>
          <input
            id="redact-file"
            type="file"
            accept="application/pdf,.pdf,image/*,.heic,.heif"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHintFile}</p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={busy() && !loaded()}>
          <p class="text-sm text-muted">{status()}</p>
        </Show>

        <Show when={loaded()}>
          {(doc) => (
            <>
              <div>
                <p class="mb-2 text-sm font-medium">{u.drawHeading}</p>
                <p class="mb-3 text-xs text-muted">{u.drawHint}</p>
                <div
                  ref={surface}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => setDrag(null)}
                  class="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded border border-border bg-surface"
                >
                  <img
                    src={doc().pages[page()]!.toDataURL('image/jpeg', 0.7)}
                    alt={fmt(u.pageAlt, { n: page() + 1 })}
                    class="pointer-events-none block w-full"
                    draggable={false}
                  />
                  <For each={current()}>
                    {(r) => (
                      <span
                        class="pointer-events-none absolute bg-black"
                        style={{
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.w * 100}%`,
                          height: `${r.h * 100}%`,
                        }}
                      />
                    )}
                  </For>
                  <Show when={preview()}>
                    {(r) => (
                      <span
                        class="pointer-events-none absolute border-2 border-danger bg-black/50"
                        style={{
                          left: `${r().x * 100}%`,
                          top: `${r().y * 100}%`,
                          width: `${r().w * 100}%`,
                          height: `${r().h * 100}%`,
                        }}
                      />
                    )}
                  </Show>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <Show when={doc().pages.length > 1}>
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page() === 0}
                        class="cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {u.prevPage}
                      </button>
                      <span class="text-xs text-muted">
                        {fmt(u.pageOf, { n: page() + 1, total: doc().pages.length })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(doc().pages.length - 1, p + 1))}
                        disabled={page() === doc().pages.length - 1}
                        class="cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {u.nextPage}
                      </button>
                    </div>
                  </Show>
                  <button
                    type="button"
                    onClick={undo}
                    disabled={current().length === 0}
                    class="cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {u.undo}
                  </button>
                  <button
                    type="button"
                    onClick={clearPage}
                    disabled={current().length === 0}
                    class="cursor-pointer rounded border border-border bg-bg px-3 py-1.5 text-xs font-medium text-fg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {u.clearPage}
                  </button>
                  <span class="text-xs text-muted">{boxesLabel(totalRegions())}</span>
                </div>
              </div>

              <p class="rounded border border-border bg-surface p-3 text-sm text-muted">
                {doc().kind === 'pdf' ? u.flattenNotePdf : u.flattenNoteImage}
              </p>

              <Button onClick={() => void run()} disabled={busy()}>
                {busy() ? u.working : u.action}
              </Button>
            </>
          )}
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(u.doneStatus, { boxes: boxesLabel(totalRegions()), size: kb(r().bytes) })}
              </p>
              <a
                href={r().url}
                download={r().name}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {u.download}
              </a>
              <p class="text-xs text-muted">{u.verifyHint}</p>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="redact" />
    </main>
  );
}
