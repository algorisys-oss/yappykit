import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ImageCropPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { decodeImage, encodeCanvas, type DecodedImage } from '@core/image/canvas-codec';
import { rectFromDrag, isDegenerate, type Point } from '@core/redact/regions';
import { fitAspect, cropToPixels, croppedName, ASPECTS, type AspectId, type Rect } from '@core/image/crop';

/**
 * Crop an image to a region you draw.
 *
 * The selection is stored as fractions and the aspect ratios are computed in
 * pixels, because a fraction is not a shape: half the width and half the height
 * of a 2000 by 1000 photo is 2:1, not square. Getting that wrong produces
 * "square" crops that are visibly not square, which is the bug this tool exists
 * to avoid.
 *
 * The drag itself reuses the geometry written for redaction, which already
 * handles dragging in any direction and leaving the element mid-drag.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function ImageCrop() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['image-crop'];
  const u = tt.ui;
  useSeo('image-crop');

  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [name, setName] = createSignal('');
  const [previewUrl, setPreviewUrl] = createSignal('');
  const [selection, setSelection] = createSignal<Rect | null>(null);
  const [aspect, setAspect] = createSignal<AspectId>('free');
  const [drag, setDrag] = createSignal<{ start: Point; current: Point } | null>(null);
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number; w: number; h: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  let surface: HTMLDivElement | undefined;

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  onCleanup(() => {
    clearResult();
    decoded()?.close();
    if (previewUrl()) URL.revokeObjectURL(previewUrl());
  });

  const ratioOf = (id: AspectId) => ASPECTS.find((a) => a.id === id)!.ratio;

  /** The live box while dragging, already constrained to the chosen ratio. */
  const live = createMemo(() => {
    const d = drag();
    const image = decoded();
    if (!d || !image) return null;
    return fitAspect(rectFromDrag(d.start, d.current), ratioOf(aspect()), image.width, image.height);
  });

  const shown = () => live() ?? selection();

  /** The crop in real pixels, which is what the label reports and the run uses. */
  const pixels = createMemo(() => {
    const image = decoded();
    const rect = shown();
    return image && rect ? cropToPixels(rect, image.width, image.height) : null;
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) await accept(file);
  }

  usePasteImages((files) => void accept(files[0]!));

  async function accept(file: File) {
    clearResult();
    setError('');
    decoded()?.close();
    if (previewUrl()) URL.revokeObjectURL(previewUrl());
    setSelection(null);
    setBusy(true);
    try {
      const image = await decodeImage(file);
      setDecoded(image);
      setName(file.name);
      setPreviewUrl(URL.createObjectURL(file));
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  const pointFrom = (e: PointerEvent): Point => {
    const box = surface!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  function onPointerDown(e: PointerEvent) {
    if (!decoded()) return;
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
    const box = live();
    setDrag(null);
    if (!box || isDegenerate(box)) return;
    clearResult();
    setSelection(box);
  }

  const changeAspect = (id: AspectId) => {
    clearResult();
    setAspect(id);
    const image = decoded();
    const current = selection();
    // Re-fit what is already selected, so switching ratio does not lose it.
    if (image && current) setSelection(fitAspect(current, ratioOf(id), image.width, image.height));
  };

  const selectAll = () => {
    const image = decoded();
    if (!image) return;
    clearResult();
    setSelection(fitAspect({ x: 0, y: 0, w: 1, h: 1 }, ratioOf(aspect()), image.width, image.height));
  };

  async function run() {
    const image = decoded();
    const px = pixels();
    if (!image || !px || !selection()) {
      setError(u.needSelection);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = px.w;
      canvas.height = px.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      // White ground: JPEG has no alpha, and a transparent source would encode
      // as black without it.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, px.w, px.h);
      ctx.drawImage(image.bitmap, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
      const bytes = await encodeCanvas(canvas, 'image/jpeg', 0.92);
      canvas.width = 0;
      canvas.height = 0;
      setResult({
        url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })),
        name: croppedName(name(), 'jpg'),
        bytes: bytes.byteLength,
        w: px.w,
        h: px.h,
      });
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ImageCropPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="crop-file">
            {u.pickLabel}
          </label>
          <input
            id="crop-file"
            type="file"
            accept="image/*,.heic,.heif"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <p class="mt-2 text-xs text-muted">{msg.content.pasteHint}</p>
          <Show when={decoded()}>
            {(image) => (
              <p class="mt-2 text-xs text-muted">
                {fmt(u.sourceMeta, { name: name(), width: image().width, height: image().height })}
              </p>
            )}
          </Show>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={decoded()}>
          <>
            <div>
              <label class="mb-2 block text-sm font-medium">{u.aspectLabel}</label>
              <div class="flex flex-wrap gap-2">
                <For each={ASPECTS}>
                  {(a) => (
                    <button
                      type="button"
                      aria-pressed={aspect() === a.id}
                      onClick={() => changeAspect(a.id)}
                      class={`min-h-9 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        aspect() === a.id
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border bg-surface text-fg'
                      }`}
                    >
                      {u[a.labelKey]}
                    </button>
                  )}
                </For>
                <button
                  type="button"
                  onClick={selectAll}
                  class="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg"
                >
                  {u.selectAll}
                </button>
              </div>
            </div>

            <div>
              <p class="mb-2 text-xs text-muted">{u.dragHint}</p>
              <div
                ref={surface}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                class="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded border border-border bg-surface"
              >
                <img
                  src={previewUrl()}
                  alt={name()}
                  class="pointer-events-none block w-full"
                  draggable={false}
                />
                <Show when={shown()}>
                  {(r) => (
                    <span
                      /* One huge shadow spreading outward dims everything
                         OUTSIDE the box, which is the whole effect. A separate
                         full-size overlay would dim the selection too. */
                      class="pointer-events-none absolute border-2 border-accent"
                      style={{
                        left: `${r().x * 100}%`,
                        top: `${r().y * 100}%`,
                        width: `${r().w * 100}%`,
                        height: `${r().h * 100}%`,
                        'box-shadow': '0 0 0 9999px rgba(0,0,0,0.45)',
                      }}
                    />
                  )}
                </Show>
              </div>
              <Show when={pixels()}>
                {(px) => (
                  <p class="mt-2 text-xs text-muted">
                    {fmt(u.selectionMeta, { width: px().w, height: px().h })}
                  </p>
                )}
              </Show>
            </div>

            <Button onClick={() => void run()} disabled={busy() || !selection()}>
              {busy() ? u.working : u.action}
            </Button>
          </>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(u.doneStatus, { width: r().w, height: r().h, size: kb(r().bytes) })}
              </p>
              <img src={r().url} alt={r().name} class="max-h-64 rounded border border-border" />
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
      <ToolContent route="image-crop" />
    </main>
  );
}
