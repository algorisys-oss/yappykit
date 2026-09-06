import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ImageResizePreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { decodeImage, type DecodedImage } from '@core/image/canvas-codec';
import {
  planResize,
  resizeImage,
  resizedName,
  PRESETS,
  type FitMode,
} from '@core/image/resize';

/**
 * Resize an image to exact pixel dimensions.
 *
 * The outcome is the size; the honest part is what happens when the picture is
 * not that shape already. Cover crops, fit pads, and the consequence of the
 * choice is stated before the button rather than discovered in the download.
 * Stretching is not offered at all.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

const MAX_DIMENSION = 8000;

export default function ImageResize() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['image-resize'];
  const u = tt.ui;
  useSeo('image-resize');

  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [name, setName] = createSignal('');
  const [width, setWidth] = createSignal(1080);
  const [height, setHeight] = createSignal(1080);
  const [mode, setMode] = createSignal<FitMode>('cover');
  const [type, setType] = createSignal<'image/jpeg' | 'image/png'>('image/jpeg');
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const clearResult = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
    setResult(null);
  };
  onCleanup(() => {
    clearResult();
    decoded()?.close();
  });

  const target = () => ({
    width: Math.min(MAX_DIMENSION, Math.max(1, Math.round(width() || 1))),
    height: Math.min(MAX_DIMENSION, Math.max(1, Math.round(height() || 1))),
  });

  /** What the chosen settings will do, worked out before anything is drawn. */
  const plan = createMemo(() => {
    const image = decoded();
    return image ? planResize({ width: image.width, height: image.height }, target(), mode()) : null;
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
    setDecoded(null);
    setBusy(true);
    try {
      const image = await decodeImage(file);
      setDecoded(image);
      setName(file.name);
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  const applyPreset = (w: number, h: number) => {
    clearResult();
    setWidth(w);
    setHeight(h);
  };

  const matchSource = () => {
    const image = decoded();
    if (!image) return;
    clearResult();
    setWidth(image.width);
    setHeight(image.height);
  };

  async function run() {
    const image = decoded();
    if (!image) {
      setError(u.needImage);
      return;
    }
    clearResult();
    setError('');
    setBusy(true);
    try {
      const out = await resizeImage(image.bitmap, { width: image.width, height: image.height }, {
        target: target(),
        mode: mode(),
        type: type(),
        background: '#ffffff',
      });
      setResult({
        url: URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: type() })),
        name: resizedName(name(), target(), type() === 'image/png' ? 'png' : 'jpg'),
        bytes: out.bytes.byteLength,
      });
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  const numberField =
    'w-28 rounded border border-border bg-surface px-3 py-2 text-sm text-fg';

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ImageResizePreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="resize-file">
            {u.pickLabel}
          </label>
          <input
            id="resize-file"
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
              <label class="mb-2 block text-sm font-medium">{u.sizeLabel}</label>
              <div class="flex flex-wrap items-end gap-3">
                <span>
                  <label class="mb-1 block text-xs text-muted" for="resize-w">{u.widthLabel}</label>
                  <input
                    id="resize-w"
                    type="number"
                    min="1"
                    max={MAX_DIMENSION}
                    value={width()}
                    onInput={(e) => { clearResult(); setWidth(e.currentTarget.valueAsNumber); }}
                    class={numberField}
                  />
                </span>
                <span>
                  <label class="mb-1 block text-xs text-muted" for="resize-h">{u.heightLabel}</label>
                  <input
                    id="resize-h"
                    type="number"
                    min="1"
                    max={MAX_DIMENSION}
                    value={height()}
                    onInput={(e) => { clearResult(); setHeight(e.currentTarget.valueAsNumber); }}
                    class={numberField}
                  />
                </span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={PRESETS}>
                  {(preset) => (
                    <button
                      type="button"
                      onClick={() => applyPreset(preset.width, preset.height)}
                      class="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg"
                    >
                      {u[preset.labelKey]}
                    </button>
                  )}
                </For>
                <button
                  type="button"
                  onClick={matchSource}
                  class="min-h-9 cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg"
                >
                  {u.presetSource}
                </button>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium">{u.modeLabel}</label>
              <SegmentedControl
                aria-label={u.modeLabel}
                options={[
                  { value: 'cover' as const, label: u.modeCover },
                  { value: 'contain' as const, label: u.modeContain },
                ]}
                value={mode()}
                onChange={(v) => { clearResult(); setMode(v); }}
              />
              <Show when={plan()}>
                {(p) => (
                  <p class="mt-2 text-xs text-muted">
                    {p().cropped ? u.willCrop : p().padded ? u.willPad : u.willFitExactly}
                  </p>
                )}
              </Show>
              <Show when={plan()?.upscaled}>
                <p class="mt-2 rounded border border-border bg-surface p-3 text-xs text-muted">
                  {u.upscaleWarning}
                </p>
              </Show>
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
                onChange={(v) => { clearResult(); setType(v); }}
              />
              <p class="mt-2 text-xs text-muted">{u.sizeNote}</p>
            </div>

            <Button onClick={() => void run()} disabled={busy()}>
              {busy() ? u.working : fmt(u.action, { width: target().width, height: target().height })}
            </Button>
          </>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(u.doneStatus, {
                  width: target().width,
                  height: target().height,
                  size: kb(r().bytes),
                })}
              </p>
              <img
                src={r().url}
                alt={r().name}
                class="max-h-64 rounded border border-border bg-surface"
              />
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
      <ToolContent route="image-resize" />
    </main>
  );
}
