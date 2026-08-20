import { createSignal, createMemo, createEffect, Show, For, onCleanup } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { PassportPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { decodeImage, type DecodedImage } from '@core/image/canvas-codec';
import { PHOTO_PRESETS, presetPixels, planPrintSheet } from '@core/photo/presets';
import { computeCrop } from '@core/photo/crop';

/**
 * Passport & Visa Photo Studio.
 *
 * Pick a country preset, frame your face inside the guide, and export a
 * correctly-sized photo (and a printable sheet) — all in this tab, no upload.
 * Auto background replacement is deferred; shoot against a plain light wall.
 */

const PREVIEW_W = 260;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PassportPhoto() {
  const { m, fmt } = useI18n();
  const tt = m.tools['passport-photo'];
  const u = tt.ui;
  useSeo('passport-photo');
  const [presetId, setPresetId] = createSignal(PHOTO_PRESETS[0]!.id);
  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [fileName, setFileName] = createSignal('');
  // Start slightly zoomed in so there is always room to pan on both axes — at
  // zoom 1 a square target (US visa) exactly fills a portrait photo and locks
  // one axis, which reads as "can't drag".
  const INITIAL_ZOOM = 1.15;
  const [zoom, setZoom] = createSignal(INITIAL_ZOOM);
  const [offX, setOffX] = createSignal(0);
  const [offY, setOffY] = createSignal(0);
  const [error, setError] = createSignal('');

  const preset = createMemo(() => PHOTO_PRESETS.find((p) => p.id === presetId())!);
  const px = createMemo(() => presetPixels(preset()));
  const aspect = createMemo(() => px().width / px().height);
  const previewH = createMemo(() => Math.round(PREVIEW_W / aspect()));

  let previewRef: HTMLCanvasElement | undefined;

  onCleanup(() => decoded()?.close());

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    decoded()?.close();
    setError('');
    setFileName(file.name);
    setZoom(INITIAL_ZOOM);
    setOffX(0);
    setOffY(0);
    try {
      setDecoded(await decodeImage(file));
    } catch {
      setDecoded(null);
      setError(u.readError);
    }
  }

  const cropOf = (img: DecodedImage) =>
    computeCrop({
      sourceWidth: img.width,
      sourceHeight: img.height,
      targetAspect: aspect(),
      zoom: zoom(),
      offsetX: offX(),
      offsetY: offY(),
    });

  // Live preview — redraws whenever the image, preset, or framing changes.
  createEffect(() => {
    const img = decoded();
    const cvs = previewRef;
    if (!cvs) return;
    cvs.width = PREVIEW_W;
    cvs.height = previewH();
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    if (!img) return;
    const c = cropOf(img);
    ctx.drawImage(img.bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, cvs.width, cvs.height);
  });

  // Drag to pan. Listeners live on window so the drag keeps tracking even when
  // the pointer leaves the small preview (the on-element version dropped it).
  const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));
  function startDrag(e: PointerEvent) {
    if (!decoded()) return;
    e.preventDefault();
    let lastX = e.clientX;
    let lastY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      // Dragging right reveals the left of the image, so the crop moves left.
      setOffX((v) => clamp1(v - (dx / PREVIEW_W) * 2));
      setOffY((v) => clamp1(v - (dy / previewH()) * 2));
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  }

  function renderToCanvas(): HTMLCanvasElement {
    const img = decoded()!;
    const size = px();
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    const c = cropOf(img);
    ctx.drawImage(img.bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, size.width, size.height);
    return canvas;
  }

  function exportPhoto() {
    if (!decoded()) return;
    renderToCanvas().toBlob((b) => b && download(b, `${preset().id}-photo.jpg`), 'image/jpeg', 0.92);
  }

  function exportSheet() {
    if (!decoded()) return;
    const p = preset();
    const plan = planPrintSheet(p);
    const size = px();
    const photo = renderToCanvas();
    const sheet = document.createElement('canvas');
    sheet.width = plan.sheet.width;
    sheet.height = plan.sheet.height;
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    for (let r = 0; r < plan.rows; r++) {
      for (let col = 0; col < plan.cols; col++) {
        ctx.drawImage(photo, plan.marginX + col * (size.width + plan.gap), plan.marginY + r * (size.height + plan.gap));
      }
    }
    sheet.toBlob((b) => b && download(b, `${p.id}-sheet.jpg`), 'image/jpeg', 0.92);
  }

  const guide = createMemo(() => {
    const p = preset();
    return { top: p.headTopFraction * previewH(), height: p.headHeightFraction * previewH() };
  });

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={PassportPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium">{u.pickLabel}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            onChange={onPick}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium" for="preset">
            {u.presetLabel}
          </label>
          <select
            id="preset"
            value={presetId()}
            onChange={(e) => setPresetId(e.currentTarget.value)}
            class="rounded border border-border bg-surface px-3 py-1.5 text-sm text-fg"
          >
            <For each={PHOTO_PRESETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
          </select>
          <p class="mt-1 text-xs text-muted">
            {fmt(u.presetMeta, {
              w: px().width,
              h: px().height,
              dpi: preset().dpi,
              date: preset().lastVerified,
            })}
          </p>
        </div>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={decoded()}>
          <div class="flex flex-wrap items-start gap-6">
            <div>
              <div
                class="relative touch-none select-none"
                style={{ width: `${PREVIEW_W}px`, height: `${previewH()}px`, cursor: 'grab' }}
                onPointerDown={startDrag}
              >
                <canvas ref={previewRef} class="rounded border border-border" style={{ cursor: 'grab' }} />
                {/* Face guide overlay (not baked into the export) */}
                <svg
                  class="pointer-events-none absolute inset-0"
                  width={PREVIEW_W}
                  height={previewH()}
                  aria-hidden="true"
                >
                  <ellipse
                    cx={PREVIEW_W / 2}
                    cy={guide().top + guide().height / 2}
                    rx={guide().height * 0.32}
                    ry={guide().height / 2}
                    fill="none"
                    stroke="var(--zen-color-primary)"
                    stroke-width="2"
                    stroke-dasharray="6 5"
                  />
                </svg>
              </div>
              <p class="mt-1 text-xs text-muted">{u.dragHint}</p>
            </div>

            <div class="min-w-52 flex-1 space-y-4">
              <div>
                <label class="mb-1 block text-sm font-medium" for="zoom">
                  {u.zoomLabel}
                </label>
                <input
                  id="zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom()}
                  onInput={(e) => setZoom(Number(e.currentTarget.value))}
                  class="w-full"
                />
              </div>
              <div class="flex flex-wrap gap-2">
                <Button onClick={exportPhoto}>{u.downloadPhoto}</Button>
                <button
                  onClick={exportSheet}
                  class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
                >
                  {fmt(u.downloadSheet, { count: planPrintSheet(preset()).count })}
                </button>
              </div>
              <p class="text-xs text-muted">{fileName()}</p>
            </div>
          </div>
        </Show>
      </div>
      <ToolContent route="passport-photo" />
    </main>
  );
}
