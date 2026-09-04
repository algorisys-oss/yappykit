import {
  createSignal,
  createEffect,
  createMemo,
  on,
  untrack,
  onCleanup,
  onMount,
  For,
  Show,
} from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { WatermarkPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate, type CapabilitySpec } from '@core/capability';
import { decodeImage, encodeCanvas, type DecodedImage } from '@core/image/canvas-codec';
import {
  defaultsFor,
  CROP_GUARD,
  type Anchor,
  type Purpose,
  type WatermarkSpec,
} from '@core/image/watermark';
import {
  paintWatermark,
  outputFor,
  watermarkedName,
  type FontFamily,
  type Ink,
  type Mark,
} from '@core/image/watermark-paint';
import { zip, uniqueNames } from '@core/archive/zip';

/**
 * Your watermark on your pictures.
 *
 * The question is what the mark is FOR, not what its opacity should be. Signing
 * a photograph and protecting a scan of a passport want opposite geometry — one
 * discreet mark in a corner against a field of them that survives a crop — and
 * the engine solves for the rest. See core/image/watermark.
 *
 * Painting means re-encoding, which is the one thing this tool cannot avoid and
 * therefore says out loud.
 */

const SPEC: CapabilitySpec = {
  required: [],
  preferred: ['createImageBitmap'],
};

/** High enough that a watermarked photograph is still the photograph. */
const QUALITY = 0.92;

const PREVIEW_W = 480;

const ZIP_NAME = 'watermarked-images.zip';

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const ANCHORS: readonly Anchor[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

const ANCHOR_KEYS = [
  'topLeft', 'top', 'topRight',
  'left', 'center', 'right',
  'bottomLeft', 'bottom', 'bottomRight',
] as const;

interface Item {
  name: string;
  sizeBytes: number;
  sourceType: string;
  decoded: DecodedImage;
  thumbUrl: string;
}

interface Done {
  name: string;
  url: string;
  bytes: number;
  converted: boolean;
}

/** Give the browser a frame between pictures so a batch does not freeze the tab. */
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

export default function ImageWatermark() {
  const { m, fmt, locale } = useI18n();
  const tt = m.tools['image-watermark'];
  const u = tt.ui;
  useSeo('image-watermark');

  const [items, setItems] = createSignal<Item[]>([]);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [markKind, setMarkKind] = createSignal<'text' | 'logo'>('text');
  const [text, setText] = createSignal('');
  const [family, setFamily] = createSignal<FontFamily>('sans');
  const [bold, setBold] = createSignal(true);
  const [logo, setLogo] = createSignal<DecodedImage | null>(null);
  const [logoName, setLogoName] = createSignal('');

  const [purpose, setPurpose] = createSignal<Purpose>('sign');
  const base = defaultsFor('sign');
  const [anchor, setAnchor] = createSignal<Anchor>(base.anchor);
  const [scale, setScale] = createSignal(base.scale);
  const [opacity, setOpacity] = createSignal(base.opacity);
  const [angle, setAngle] = createSignal(base.angleDeg);
  const [gap, setGap] = createSignal(base.tileGap);
  const [ink, setInk] = createSignal<Ink>('auto');

  const [degraded, setDegraded] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [results, setResults] = createSignal<Done[]>([]);
  const [archive, setArchive] = createSignal<{ url: string; bytes: number } | null>(null);

  let previewRef: HTMLCanvasElement | undefined;
  const [previewSource, setPreviewSource] = createSignal<DecodedImage | null>(null);

  onMount(() => setDegraded(!evaluate(SPEC, detectCapabilities()).fastPath));

  const spec = createMemo<WatermarkSpec>(() => ({
    ...defaultsFor(purpose()),
    anchor: anchor(),
    scale: scale(),
    opacity: opacity(),
    angleDeg: angle(),
    tileGap: gap(),
  }));

  const mark = createMemo<Mark | null>(() => {
    if (markKind() === 'text') {
      const t = text().trim();
      return t ? { kind: 'text', text: t, family: family(), bold: bold() } : null;
    }
    const l = logo();
    return l ? { kind: 'image', bitmap: l.bitmap } : null;
  });

  const clearResults = () => {
    for (const r of results()) URL.revokeObjectURL(r.url);
    const a = archive();
    if (a) URL.revokeObjectURL(a.url);
    setResults([]);
    setArchive(null);
    setStatus('');
  };

  // Any change to the pictures or to the mark invalidates what was produced
  // from the previous ones, so the download can never belong to an older state.
  //
  // `on` is not a style choice: clearResults reads the very signals it clears,
  // so a plain effect would re-run itself for ever.
  createEffect(on([items, mark, spec, ink], () => clearResults(), { defer: true }));

  onCleanup(() => {
    clearResults();
    for (const it of items()) {
      URL.revokeObjectURL(it.thumbUrl);
      it.decoded.close();
    }
    logo()?.close();
    previewSource()?.close();
  });

  /** The preview runs the real painter on a small copy, so it cannot drift. */
  createEffect(
    on(
      () => items()[0],
      (first) => {
        const old = untrack(previewSource);
        if (!first) {
          old?.close();
          setPreviewSource(null);
          return;
        }
        let live = true;
        const width = Math.min(PREVIEW_W, first.decoded.width);
        const height = Math.max(
          1,
          Math.round((width * first.decoded.height) / first.decoded.width),
        );
        void createImageBitmap(first.decoded.bitmap, { resizeWidth: width, resizeHeight: height })
          .then((bitmap) => {
            if (!live) {
              bitmap.close();
              return;
            }
            old?.close();
            setPreviewSource({ bitmap, width, height, close: () => bitmap.close() });
          })
          .catch(() => undefined);
        onCleanup(() => {
          live = false;
        });
      },
    ),
  );

  createEffect(() => {
    const source = previewSource();
    const mk = mark();
    const canvas = previewRef;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!source) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    canvas.width = source.width;
    canvas.height = source.height;
    if (mk) {
      ctx.drawImage(paintWatermark(source, mk, spec(), ink()), 0, 0);
    } else {
      ctx.drawImage(source.bitmap, 0, 0);
    }
  });

  /** Switching purpose resets the fine tuning, because it is a different job. */
  const changePurpose = (next: Purpose) => {
    const d = defaultsFor(next);
    setPurpose(next);
    setAnchor(d.anchor);
    setScale(d.scale);
    setOpacity(d.opacity);
    setAngle(d.angleDeg);
    setGap(d.tileGap);
  };

  const useIdPreset = () => {
    changePurpose('protect');
    setMarkKind('text');
    setText(
      fmt(u.idPresetText, {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date()),
      }),
    );
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])].sort((a, b) => byName.compare(a.name, b.name));
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
          const decoded = await decodeImage(file);
          added.push({
            name: file.name,
            sizeBytes: file.size,
            sourceType: file.type,
            decoded,
            thumbUrl: URL.createObjectURL(file),
          });
        } catch {
          rejected.push(fmt(u.unreadable, { name: file.name }));
        }
      }
      setItems([...items(), ...added]);
      setSkipped(rejected);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function onLogo(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const decoded = await decodeImage(file);
      logo()?.close();
      setLogo(decoded);
      setLogoName(file.name);
      setMarkKind('logo');
    } catch {
      setError(fmt(u.unreadable, { name: file.name }));
    }
  }

  const drop = (index: number) => {
    const gone = items()[index];
    if (gone) {
      URL.revokeObjectURL(gone.thumbUrl);
      gone.decoded.close();
    }
    setItems(items().filter((_, i) => i !== index));
  };

  async function run() {
    const list = items();
    const mk = mark();
    if (!mk) return;

    setBusy(true);
    setError('');
    clearResults();
    setStatus(fmt(u.progress, { done: 0, total: list.length }));

    try {
      const painted: { name: string; bytes: Uint8Array; type: string; converted: boolean }[] = [];
      for (const it of list) {
        const canvas = paintWatermark(it.decoded, mk, spec(), ink());
        const { type, converted } = outputFor(it.sourceType);
        const bytes = await encodeCanvas(canvas, type, type === 'image/jpeg' ? QUALITY : undefined);
        painted.push({ name: watermarkedName(it.name, type), bytes, type, converted });
        setStatus(fmt(u.progress, { done: painted.length, total: list.length }));
        await yieldToUi();
      }

      const names = uniqueNames(painted.map((p) => p.name));
      const done = painted.map((p, i) => ({
        name: names[i]!,
        url: URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.type })),
        bytes: p.bytes.byteLength,
        converted: p.converted,
      }));
      setResults(done);

      if (done.length > 1) {
        const bytes = zip(painted.map((p, i) => ({ name: names[i]!, bytes: p.bytes })));
        setArchive({
          url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' })),
          bytes: bytes.byteLength,
        });
      }

      const total = done.reduce((n, d) => n + d.bytes, 0);
      setStatus(fmt(u.doneStatus, { files: done.length, size: kb(total) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : u.failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  const ready = () => items().length > 0 && mark() !== null;

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={WatermarkPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="watermark-files">
            {u.pickLabel}
          </label>
          <input
            id="watermark-files"
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
            <ul class="list-none space-y-2 p-0">
              <For each={items()}>
                {(item, i) => (
                  <li class="flex items-center gap-3 rounded border border-border bg-surface p-3">
                    <img
                      src={item.thumbUrl}
                      alt=""
                      class="h-12 w-12 shrink-0 rounded border border-border bg-bg object-cover"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-fg">{item.name}</span>
                      <span class="block text-xs text-muted">
                        {fmt(u.rowMeta, {
                          w: item.decoded.width,
                          h: item.decoded.height,
                          size: kb(item.sizeBytes),
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={fmt(u.remove, { name: item.name })}
                      onClick={() => drop(i())}
                      class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-bg text-danger"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <p class="mt-2 text-xs text-muted">{fmt(u.summary, { files: items().length })}</p>
          </div>
        </Show>

        <div>
          <p class="mb-2 text-sm font-medium">{u.markLabel}</p>
          <SegmentedControl
            aria-label={u.markLabel}
            options={[
              { value: 'text', label: u.markText },
              { value: 'logo', label: u.markLogo },
            ]}
            value={markKind()}
            onChange={(v: string) => setMarkKind(v as 'text' | 'logo')}
          />

          <Show when={markKind() === 'text'}>
            <div class="mt-3 space-y-3">
              <input
                type="text"
                value={text()}
                placeholder={u.textPlaceholder}
                aria-label={u.textLabel}
                onInput={(e) => setText(e.currentTarget.value)}
                class="block w-full rounded border border-border bg-surface p-2 text-sm text-fg"
              />
              <div class="flex flex-wrap items-center gap-3">
                <SegmentedControl
                  aria-label={u.fontLabel}
                  options={[
                    { value: 'sans', label: u.fontSans },
                    { value: 'serif', label: u.fontSerif },
                    { value: 'mono', label: u.fontMono },
                  ]}
                  value={family()}
                  onChange={(v: string) => setFamily(v as FontFamily)}
                />
                <label class="flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input type="checkbox" checked={bold()} onChange={(e) => setBold(e.currentTarget.checked)} />
                  {u.boldLabel}
                </label>
              </div>
            </div>
          </Show>

          <Show when={markKind() === 'logo'}>
            <div class="mt-3">
              <input
                type="file"
                accept="image/png,image/webp,image/svg+xml,image/*"
                aria-label={u.logoLabel}
                onChange={(e) => void onLogo(e)}
                class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
              />
              <p class="mt-2 text-xs text-muted">{logoName() ? logoName() : u.logoHint}</p>
            </div>
          </Show>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium">{u.purposeLabel}</p>
          <SegmentedControl
            aria-label={u.purposeLabel}
            options={[
              { value: 'sign', label: u.purposeSign },
              { value: 'protect', label: u.purposeProtect },
            ]}
            value={purpose()}
            onChange={(v: string) => changePurpose(v as Purpose)}
          />
          <p class="mt-2 text-xs text-muted">
            {purpose() === 'sign' ? u.signHint : fmt(u.protectHint, { percent: Math.round(CROP_GUARD * 100) })}
          </p>
          <button
            type="button"
            onClick={useIdPreset}
            class="mt-3 cursor-pointer rounded border border-border bg-surface px-3 py-2 text-sm text-fg"
          >
            {u.idPresetAction}
          </button>
          <p class="mt-2 text-xs text-muted">{u.idPresetHint}</p>
        </div>

        <Show when={previewSource()}>
          <div>
            <p class="mb-2 text-sm font-medium">{u.previewLabel}</p>
            <canvas
              ref={previewRef}
              class="max-w-full rounded border border-border"
              aria-label={u.previewLabel}
            />
            <p class="mt-2 text-xs text-muted">{u.previewHint}</p>
          </div>
        </Show>

        <details class="rounded border border-border bg-surface p-3">
          <summary class="cursor-pointer text-sm font-medium text-fg">{u.advanced}</summary>
          <div class="mt-4 space-y-4">
            <Show when={purpose() === 'sign'}>
              <div>
                <p class="mb-2 text-sm font-medium">{u.anchorLabel}</p>
                <div class="grid w-32 grid-cols-3 gap-1">
                  <For each={ANCHORS}>
                    {(a, i) => (
                      <button
                        type="button"
                        aria-label={u.anchors[ANCHOR_KEYS[i()]!]}
                        aria-pressed={anchor() === a}
                        onClick={() => setAnchor(a)}
                        class={`h-9 cursor-pointer rounded border border-border ${
                          anchor() === a ? 'bg-accent' : 'bg-bg'
                        }`}
                      />
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Range
              label={u.sizeLabel}
              min={0.02}
              max={0.25}
              step={0.005}
              value={scale()}
              onChange={setScale}
              display={`${Math.round(scale() * 100)}%`}
            />
            <Range
              label={u.opacityLabel}
              min={0.05}
              max={1}
              step={0.05}
              value={opacity()}
              onChange={setOpacity}
              display={`${Math.round(opacity() * 100)}%`}
            />
            <Range
              label={u.angleLabel}
              min={-90}
              max={90}
              step={5}
              value={angle()}
              onChange={setAngle}
              display={`${angle()}°`}
            />
            <Show when={purpose() === 'protect'}>
              <Range
                label={u.spacingLabel}
                min={0.2}
                max={2}
                step={0.1}
                value={gap()}
                onChange={setGap}
                display={`${gap().toFixed(1)}×`}
              />
            </Show>

            <Show when={markKind() === 'text'}>
              <div>
                <p class="mb-2 text-sm font-medium">{u.inkLabel}</p>
                <SegmentedControl
                  aria-label={u.inkLabel}
                  options={[
                    { value: 'auto', label: u.inkAuto },
                    { value: 'light', label: u.inkLight },
                    { value: 'dark', label: u.inkDark },
                  ]}
                  value={ink()}
                  onChange={(v: string) => setInk(v as Ink)}
                />
                <p class="mt-2 text-xs text-muted">{u.inkHint}</p>
              </div>
            </Show>
          </div>
        </details>

        <Show when={degraded()}>
          <p class="text-xs text-muted">{u.degraded}</p>
        </Show>

        <p class="text-xs text-muted">{u.reencodeNote}</p>

        <Button onClick={() => void run()} disabled={busy() || !ready()}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={results().some((r) => r.converted)}>
          <ul class="list-none space-y-1 rounded border border-border bg-surface p-3 text-sm text-muted">
            <For each={results().filter((r) => r.converted)}>
              {(r) => <li>{fmt(u.converted, { name: r.name })}</li>}
            </For>
          </ul>
        </Show>

        <Show when={results().length > 0}>
          <div class="space-y-3">
            <Show when={archive()}>
              {(a) => (
                <a
                  href={a().url}
                  download={ZIP_NAME}
                  class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
                >
                  {fmt(u.downloadZip, { files: results().length, size: kb(a().bytes) })}
                </a>
              )}
            </Show>
            <ul class="list-none space-y-2 p-0">
              <For each={results()}>
                {(r) => (
                  <li class="flex items-center justify-between gap-3 rounded border border-border bg-surface p-3">
                    <span class="min-w-0 truncate text-sm text-fg">{r.name}</span>
                    <a
                      href={r.url}
                      download={r.name}
                      class="shrink-0 text-sm font-medium text-accent no-underline"
                    >
                      {fmt(u.download, { size: kb(r.bytes) })}
                    </a>
                  </li>
                )}
              </For>
            </ul>
            <p class="text-xs text-muted">{u.privacyNote}</p>
            <p class="text-xs text-muted">{u.verifyHint}</p>
          </div>
        </Show>
      </div>

      <ToolContent route="image-watermark" />
    </main>
  );
}

function Range(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label class="block">
      <span class="mb-1 flex items-center justify-between text-sm font-medium">
        <span>{props.label}</span>
        <span class="text-xs font-normal text-muted">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        class="w-full cursor-pointer"
      />
    </label>
  );
}
