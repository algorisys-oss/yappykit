import { createSignal, createMemo, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import { ScreenshotSplitPreview } from '../tool-previews';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteImages } from '../../lib/paste';
import { decodeImage, type DecodedImage } from '@core/image/canvas-codec';
import { zip } from '@core/archive/zip';
import {
  pieceCount,
  evenCuts,
  toPieces,
  rowNoise,
  snapCuts,
  pieceName,
  screenHeightFor,
  type SplitMode,
} from '@core/screenshot/split';

/**
 * Cut a tall capture into pieces.
 *
 * The cuts are nudged to quiet rows so they miss the text, and the pixels for
 * that decision are read one narrow band at a time. Reading the whole capture
 * would be the obvious implementation and the wrong one: a 1,000 by 20,000
 * capture is 80 MB of RGBA, which is a tab crash on a phone, and all but a few
 * hundred of those rows can never be chosen anyway.
 */

/** How far a cut may travel to find a quiet row: about a line and a half. */
const SNAP_RADIUS = 24;

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

export default function ScreenshotSplit() {
  const { m: msg, fmt } = useI18n();
  const tt = msg.tools['screenshot-split'];
  const u = tt.ui;
  useSeo('screenshot-split');

  const [decoded, setDecoded] = createSignal<DecodedImage | null>(null);
  const [name, setName] = createSignal('');
  const [previewUrl, setPreviewUrl] = createSignal('');
  const [mode, setMode] = createSignal<SplitMode>('screen');
  const [wanted, setWanted] = createSignal(3);
  const [result, setResult] = createSignal<{ url: string; name: string; bytes: number; count: number } | null>(null);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal(0);

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

  /** Square tiles are cut at exactly the width, so snapping cannot apply: a
      moved cut is a tile that is no longer square, which was the whole ask. */
  const snaps = () => mode() !== 'square';

  const count = createMemo(() => {
    const image = decoded();
    return image ? pieceCount(mode(), image.height, image.width, wanted()) : 0;
  });

  const planned = createMemo(() => {
    const image = decoded();
    if (!image) return null;
    const pieces = toPieces(evenCuts(mode(), image.height, image.width, count()), image.height);
    return { pieces, width: image.width };
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

  /**
   * Score only the rows a cut could actually move to.
   *
   * Everything else keeps the sentinel, which is larger than any real score, so
   * `snapCuts` will never pick a row we did not look at.
   */
  function scoreBands(image: DecodedImage, cuts: readonly number[]): Uint32Array {
    const scores = new Uint32Array(image.height).fill(0xffffffff);
    if (!cuts.length) return scores;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = SNAP_RADIUS * 2 + 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return scores;
    for (const cut of cuts) {
      const top = Math.max(0, cut - SNAP_RADIUS);
      const bottom = Math.min(image.height, cut + SNAP_RADIUS + 1);
      const rows = bottom - top;
      if (rows <= 0) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image.bitmap, 0, top, image.width, rows, 0, 0, image.width, rows);
      const band = ctx.getImageData(0, 0, image.width, rows).data;
      const scored = rowNoise(band, image.width, rows);
      for (let i = 0; i < rows; i += 1) scores[top + i] = scored[i]!;
    }
    canvas.width = 0;
    canvas.height = 0;
    return scores;
  }

  async function run() {
    const image = decoded();
    if (!image) return;
    clearResult();
    setError('');
    setBusy(true);
    setProgress(0);
    try {
      const raw = evenCuts(mode(), image.height, image.width, count());
      const cuts = snaps() ? snapCuts(raw, scoreBands(image, raw), SNAP_RADIUS) : raw;
      const pieces = toPieces(cuts, image.height);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      const files: { name: string; bytes: Uint8Array }[] = [];
      for (const [i, piece] of pieces.entries()) {
        canvas.width = image.width;
        canvas.height = piece.h;
        ctx.clearRect(0, 0, image.width, piece.h);
        ctx.drawImage(image.bitmap, 0, piece.y, image.width, piece.h, 0, 0, image.width, piece.h);
        // PNG, not JPEG: a screenshot is text and flat colour, which is what
        // PNG is good at and what JPEG smears.
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('encode failed');
        files.push({
          name: pieceName(name(), i, pieces.length, 'png'),
          bytes: new Uint8Array(await blob.arrayBuffer()),
        });
        setProgress(i + 1);
      }
      canvas.width = 0;
      canvas.height = 0;

      const single = files.length === 1;
      const bytes = single ? files[0]!.bytes : zip(files);
      const outName = single ? files[0]!.name : `${name().replace(/\.[^.]+$/, '') || 'screenshot'}-pieces.zip`;
      setResult({
        url: URL.createObjectURL(
          new Blob([bytes as BlobPart], { type: single ? 'image/png' : 'application/zip' }),
        ),
        name: outName,
        bytes: bytes.byteLength,
        count: files.length,
      });
    } catch {
      setError(u.failed);
    } finally {
      setBusy(false);
    }
  }

  const modes: { id: SplitMode; label: string }[] = [
    { id: 'screen', label: u.modeScreen },
    { id: 'pieces', label: u.modePieces },
    { id: 'square', label: u.modeSquare },
  ];

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ScreenshotSplitPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="split-file">
            {u.pickLabel}
          </label>
          <input
            id="split-file"
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
          {(image) => (
            <>
              <div>
                <label class="mb-2 block text-sm font-medium">{u.modeLabel}</label>
                <SegmentedControl
                  aria-label={u.modeLabel}
                  value={mode()}
                  onChange={(v) => {
                    clearResult();
                    setMode(v as SplitMode);
                  }}
                  options={modes.map((o) => ({ value: o.id, label: o.label }))}
                />
                <Show when={mode() === 'pieces'}>
                  <div class="mt-3 flex items-center gap-2">
                    <label class="text-sm" for="split-count">
                      {u.countLabel}
                    </label>
                    <input
                      id="split-count"
                      type="number"
                      min="1"
                      max="50"
                      value={wanted()}
                      onInput={(e) => {
                        clearResult();
                        setWanted(Number(e.currentTarget.value) || 1);
                      }}
                      class="w-20 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
                    />
                  </div>
                </Show>
                <p class="mt-2 text-xs text-muted">
                  {mode() === 'square'
                    ? fmt(u.squareNote, { size: image().width })
                    : mode() === 'screen'
                      ? fmt(u.screenNote, { height: screenHeightFor(image().width) })
                      : u.snapNote}
                </p>
              </div>

              <Show when={planned()}>
                {(plan) => (
                  <div>
                    <p class="text-sm text-fg">
                      {fmt(plan().pieces.length === 1 ? u.planOne : u.planMany, {
                        count: plan().pieces.length,
                        width: plan().width,
                        height: plan().pieces[0]!.h,
                      })}
                    </p>
                    <div class="mt-2 flex gap-1" aria-hidden="true">
                      <For each={plan().pieces.slice(0, 12)}>
                        {() => <span class="h-2 flex-1 rounded-full bg-accent" />}
                      </For>
                    </div>
                  </div>
                )}
              </Show>

              <Button onClick={() => void run()} disabled={busy()}>
                {busy()
                  ? progress()
                    ? fmt(u.progress, { done: progress(), total: count() })
                    : u.working
                  : u.action}
              </Button>
            </>
          )}
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2">
              <p class="rounded border border-success bg-success-soft p-3 text-sm text-fg" role="status">
                {fmt(r().count === 1 ? u.doneOne : u.doneMany, {
                  count: r().count,
                  size: kb(r().bytes),
                })}
              </p>
              <div>
                <a
                  href={r().url}
                  download={r().name}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {r().count === 1 ? u.download : u.downloadZip}
                </a>
              </div>
            </div>
          )}
        </Show>
      </div>
      <ToolContent route="screenshot-split" />
    </main>
  );
}
