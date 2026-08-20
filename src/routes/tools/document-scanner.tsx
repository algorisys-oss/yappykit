import { createSignal, createEffect, Show, onCleanup } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { DocScanPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { decodeImage, type DecodedImage } from '@core/image/canvas-codec';
import { enhanceDocument, type EnhanceMode } from '@core/document/enhance';
import { recognizeText } from '@core/document/ocr';

/**
 * Document Scanner + OCR.
 *
 * Clean up a phone photo of a page (grayscale / high-contrast / black-and-white)
 * and pull out its text. Enhancement and text recognition both run in this tab;
 * the image is never uploaded. OCR downloads an English language pack the first
 * time — a program asset, not your file — which is disclosed below.
 */

const MAX_DIM = 2000; // cap working resolution for responsiveness

// Values are fixed; the LABELS come from the active locale.
const MODES = [
  { value: 'enhance', labelKey: 'modeEnhance' },
  { value: 'grayscale', labelKey: 'modeGrayscale' },
  { value: 'bw', labelKey: 'modeBw' },
] as const;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DocumentScanner() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['document-scan'];
  const u = tt.ui;
  useSeo('document-scan');
  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [fileName, setFileName] = createSignal('');
  const [mode, setMode] = createSignal<EnhanceMode>('enhance');
  const [error, setError] = createSignal('');
  const [ocrText, setOcrText] = createSignal('');
  const [ocrBusy, setOcrBusy] = createSignal(false);
  const [ocrStatus, setOcrStatus] = createSignal('');

  let workRef: HTMLCanvasElement | undefined;

  onCleanup(() => decoded()?.close());

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    decoded()?.close();
    setError('');
    setOcrText('');
    setOcrStatus('');
    setFileName(file.name);
    try {
      setDecoded(await decodeImage(file));
    } catch {
      setDecoded(null);
      setError(u.readError);
    }
  }

  // Render the enhanced document whenever the image or mode changes.
  createEffect(() => {
    const img = decoded();
    const cvs = workRef;
    if (!cvs || !img) return;
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img.bitmap, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    // Reuse the existing ImageData buffer (avoids the ArrayBuffer generic mismatch
    // constructing a fresh ImageData from a plain Uint8ClampedArray).
    id.data.set(enhanceDocument(id.data, mode()));
    ctx.putImageData(id, 0, 0);
  });

  function downloadImage() {
    workRef?.toBlob((b) => b && download(b, `scan-${fileName() || 'document'}.png`), 'image/png');
  }

  async function runOcr() {
    if (!workRef) return;
    setOcrBusy(true);
    setOcrText('');
    setOcrStatus(u.ocrLoading);
    try {
      const text = await recognizeText(workRef, (p) =>
        setOcrStatus(fmt(u.ocrProgress, { status: p.status, pct: Math.round(p.progress * 100) })),
      );
      setOcrText(text || u.ocrEmpty);
      setOcrStatus('');
    } catch (err) {
      setOcrStatus(err instanceof Error ? fmt(u.ocrFailedWith, { message: err.message }) : u.ocrFailed);
    } finally {
      setOcrBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={DocScanPreview}>
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

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={decoded()}>
          <div class="space-y-4">
            <div>
              <p class="mb-2 text-sm font-medium">{u.modeLabel}</p>
              <SegmentedControl
                aria-label={u.modeLabel}
                options={MODES.map((md) => ({ value: md.value, label: u[md.labelKey] }))}
                value={mode()}
                onChange={setMode}
              />
            </div>

            <canvas ref={workRef} class="max-h-96 w-auto max-w-full rounded border border-border" />

            <div class="flex flex-wrap gap-2">
              <Button onClick={downloadImage}>{u.downloadImage}</Button>
              <button
                onClick={() => void runOcr()}
                disabled={ocrBusy()}
                class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent disabled:opacity-50"
              >
                {ocrBusy() ? u.extracting : u.extractText}
              </button>
            </div>
            <p class="text-xs text-muted">{u.ocrPackNote}</p>

            <Show when={ocrStatus()}>
              <p class="text-sm text-muted" role="status">
                {ocrStatus()}
              </p>
            </Show>

            <Show when={ocrText()}>
              <div class="space-y-2">
                <textarea
                  class="h-56 w-full rounded border border-border bg-surface p-3 font-mono text-sm text-fg"
                  value={ocrText()}
                  onInput={(e) => setOcrText(e.currentTarget.value)}
                />
                <button
                  onClick={() =>
                    download(new Blob([ocrText()], { type: 'text/plain' }), `${fileName() || 'document'}.txt`)
                  }
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
                >
                  {u.downloadText}
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <ToolContent route="document-scan" />
    </main>
  );
}
