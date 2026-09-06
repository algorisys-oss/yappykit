import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import ToolHero from '../../components/ToolHero';
import { ColorPickerPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { decodeImage, type DecodedImage } from '@core/image/canvas-codec';
import {
  toHex,
  toRgbCss,
  toHslCss,
  contrastRatio,
  readableTextOn,
  samplePixels,
  extractPalette,
  BLACK,
  WHITE,
  type Rgb,
  type Swatch,
} from '@core/color/palette';

/**
 * Pick a colour out of an image, and see what the image is mostly made of.
 *
 * The contrast figures are the reason this is more than a novelty: a colour
 * lifted from a photograph usually ends up as a background behind text, and
 * whether that works is a number, not a matter of taste.
 */

export default function ColorPicker() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['color-picker'];
  const u = tt.ui;
  useSeo('color-picker');

  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [name, setName] = createSignal('');
  const [previewUrl, setPreviewUrl] = createSignal('');
  const [palette, setPalette] = createSignal<Swatch[]>([]);
  const [picked, setPicked] = createSignal<Rgb | null>(null);
  const [copied, setCopied] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  let surface: HTMLDivElement | undefined;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    clearTimeout(copiedTimer);
    decoded()?.close();
    if (previewUrl()) URL.revokeObjectURL(previewUrl());
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) await accept(file);
  }

  usePasteImages((files) => void accept(files[0]!));

  async function accept(file: File) {
    setError('');
    decoded()?.close();
    if (previewUrl()) URL.revokeObjectURL(previewUrl());
    setPalette([]);
    setPicked(null);
    setBusy(true);
    try {
      const image = await decodeImage(file);
      setDecoded(image);
      setName(file.name);
      setPreviewUrl(URL.createObjectURL(file));
      setPalette(extractPalette(sampleOf(image), 6));
    } catch {
      setError(u.readError);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Read the image small.
   *
   * The palette is drawn onto a canvas of at most 200 pixels a side, because
   * the colours of an image survive being shrunk and 48 MB of RGBA does not
   * survive a phone. Picking a colour reads the full-size bitmap instead, since
   * that has to be the pixel the user actually pointed at.
   */
  function sampleOf(image: DecodedImage): Rgb[] {
    const scale = Math.min(1, 200 / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(image.bitmap, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    canvas.width = 0;
    canvas.height = 0;
    return samplePixels(data, w, h);
  }

  function pickAt(e: PointerEvent) {
    const image = decoded();
    if (!image || !surface) return;
    const box = surface.getBoundingClientRect();
    const x = Math.floor(((e.clientX - box.left) / box.width) * image.width);
    const y = Math.floor(((e.clientY - box.top) / box.height) * image.height);
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    // One pixel, drawn one-to-one: no smoothing, or the answer is a blend of
    // the pixel and its neighbours rather than the colour that was pointed at.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image.bitmap, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    canvas.width = 0;
    canvas.height = 0;
    setPicked({ r: r!, g: g!, b: b! });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => setCopied(''), 1500);
    } catch {
      setError(u.copyFailed);
    }
  }

  const current = () => picked() ?? palette()[0]?.rgb ?? null;

  const readings = createMemo(() => {
    const c = current();
    if (!c) return null;
    return {
      hex: toHex(c),
      rgb: toRgbCss(c),
      hsl: toHslCss(c),
      onWhite: contrastRatio(c, WHITE),
      onBlack: contrastRatio(c, BLACK),
      ink: toHex(readableTextOn(c)),
    };
  });

  const ratio = (n: number) => `${n.toFixed(2)}:1`;
  const grade = (n: number) => (n >= 7 ? 'AAA' : n >= 4.5 ? 'AA' : n >= 3 ? u.largeOnly : u.failsText);

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ColorPickerPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="color-file">
            {u.pickLabel}
          </label>
          <input
            id="color-file"
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
        <Show when={busy()}>
          <p class="text-sm text-muted">{u.working}</p>
        </Show>

        <Show when={decoded()}>
          <div>
            <p class="mb-2 text-xs text-muted">{u.pointHint}</p>
            <div
              ref={surface}
              onPointerDown={pickAt}
              class="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded border border-border bg-surface"
            >
              <img
                src={previewUrl()}
                alt={name()}
                class="pointer-events-none block max-h-96 w-full object-contain"
                draggable={false}
              />
            </div>
          </div>
        </Show>

        <Show when={readings()}>
          {(r) => (
            <div class="space-y-3">
              <div
                class="flex items-center justify-center rounded border border-border py-8 text-lg font-semibold"
                style={{ background: r().hex, color: r().ink }}
              >
                {r().hex}
              </div>
              <div class="flex flex-wrap gap-2">
                <For each={[r().hex, r().rgb, r().hsl]}>
                  {(value) => (
                    <button
                      type="button"
                      onClick={() => void copy(value)}
                      class="min-h-9 cursor-pointer rounded border border-border bg-surface px-3 py-1.5 font-mono text-xs text-fg"
                    >
                      {copied() === value ? u.copied : value}
                    </button>
                  )}
                </For>
              </div>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div class="rounded border border-border bg-surface p-3">
                  <dt class="text-xs text-muted">{u.onWhite}</dt>
                  <dd class="text-fg">
                    {ratio(r().onWhite)} · {grade(r().onWhite)}
                  </dd>
                </div>
                <div class="rounded border border-border bg-surface p-3">
                  <dt class="text-xs text-muted">{u.onBlack}</dt>
                  <dd class="text-fg">
                    {ratio(r().onBlack)} · {grade(r().onBlack)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </Show>

        <Show when={palette().length}>
          <div>
            <h2 class="mb-2 text-sm font-medium">{u.paletteLabel}</h2>
            <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <For each={palette()}>
                {(s) => (
                  <li>
                    <button
                      type="button"
                      onClick={() => setPicked(s.rgb)}
                      class="w-full cursor-pointer rounded border border-border p-3 text-start"
                      style={{ background: s.hex, color: toHex(readableTextOn(s.rgb)) }}
                    >
                      <span class="block font-mono text-xs">{s.hex}</span>
                      <span class="block text-xs opacity-90">
                        {fmt(u.share, { percent: Math.round(s.share * 100) })}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <p class="mt-2 text-xs text-muted">{u.paletteNote}</p>
          </div>
        </Show>
      </div>
      <ToolContent route="color-picker" />
    </main>
  );
}
