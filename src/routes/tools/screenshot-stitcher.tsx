import { createSignal, createMemo, onCleanup, onMount, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { ScreenshotStitchPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate } from '@core/capability';
import { TOOL_CAPABILITIES } from '../../lib/tool-capabilities';
import { move } from '@core/list';
import { planStitch, type StitchPlan } from '@core/screenshot/stitch';
import {
  loadShots,
  composePlan,
  composeSlice,
  encodeCanvas,
  stitchedName,
  type Shot,
} from '@core/screenshot/compose';
import { slicePages, sliceHeightFor, buildPdf } from '@core/screenshot/pdf';

/**
 * Join overlapping screenshots into one scrolling capture.
 *
 * The interface is the ORDER and the OUTCOME, and nothing else. There is no
 * overlap field and no alignment control, because the overlap is the thing the
 * user does not know and the machine can measure: see core/screenshot/stitch.
 * What the user does know is which screenshot came first and what they need
 * back, so those are the only two questions asked.
 */


type Output = 'png' | 'jpeg' | 'pdf';

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** Phones number screenshots as they are taken, so 2 must sort before 10. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

interface Item {
  name: string;
  sizeBytes: number;
  shot: Shot;
}

interface Result {
  url: string;
  bytes: number;
  extension: string;
  /** Output image size, or null for a PDF, which is described by page count. */
  size: { w: number; h: number } | null;
  pages: number;
}

export default function ScreenshotStitcher() {
  const { m, fmt } = useI18n();
  const tt = m.tools['screenshot-stitch'];
  const u = tt.ui;
  useSeo('screenshot-stitch');

  const [items, setItems] = createSignal<Item[]>([]);
  const [skipped, setSkipped] = createSignal<string[]>([]);
  const [output, setOutput] = createSignal<Output>('png');
  const [degraded, setDegraded] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal('');
  const [error, setError] = createSignal('');
  const [plan, setPlan] = createSignal<StitchPlan | null>(null);
  const [shrunkTo, setShrunkTo] = createSignal(1);
  const [result, setResult] = createSignal<Result | null>(null);

  onMount(() => setDegraded(!evaluate(TOOL_CAPABILITIES['screenshot-stitch'], detectCapabilities()).fastPath));

  const revoke = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(() => {
    revoke();
    for (const item of items()) item.shot.close();
  });

  /** Any edit to the list invalidates a capture built from the old one. */
  const edit = (next: Item[]) => {
    revoke();
    setResult(null);
    setPlan(null);
    setStatus('');
    setItems(next);
  };

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    // Clearing the input lets the same file be added again after it was removed.
    e.currentTarget.value = '';
    if (files.length === 0) return;
    files.sort((a, b) => byName.compare(a.name, b.name));

    setBusy(true);
    setError('');
    setSkipped([]);
    setStatus(u.reading);
    try {
      const { shots, rejected } = await loadShots(files);
      edit([
        ...items(),
        ...shots.map((shot) => ({
          name: shot.name,
          sizeBytes: files.find((f) => f.name === shot.name)?.size ?? 0,
          shot,
        })),
      ]);
      setSkipped(rejected.map((name) => fmt(u.unreadable, { name })));
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  const shift = (index: number, to: number) => edit(move(items(), index, to));
  const drop = (index: number) => {
    items()[index]?.shot.close();
    edit(items().filter((_, i) => i !== index));
  };

  /** What the seam search found, in the order it is worth reading. */
  const notes = createMemo(() => {
    const p = plan();
    if (!p) return [];
    const out: string[] = [];
    const kinds = p.seams.map((s) => s.kind);
    const count = (kind: string) => kinds.filter((k) => k === kind).length;
    if (p.seams.length > 0) {
      out.push(fmt(u.seamsMatched, { n: count('matched'), total: p.seams.length }));
    }
    if (count('weak') > 0) out.push(fmt(u.seamsWeak, { n: count('weak') }));
    if (count('joined') > 0) out.push(fmt(u.seamsJoined, { n: count('joined') }));
    for (const i of p.duplicates) {
      out.push(fmt(u.duplicateNote, { name: items()[i]?.name ?? '' }));
    }
    const rows = p.chrome.headerRows + p.chrome.footerRows;
    if (rows > 0) out.push(fmt(u.chromeNote, { rows }));
    if (items().some((it) => it.shot.scaled)) {
      out.push(fmt(u.scaledNote, { w: p.width }));
    }
    if (shrunkTo() < 1) {
      out.push(fmt(u.shrunkNote, { percent: Math.round(shrunkTo() * 100) }));
    }
    return out;
  });

  /** Let the status paint before the seam search takes the main thread. */
  const yieldToPaint = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function run() {
    const list = items();
    setBusy(true);
    setError('');
    setShrunkTo(1);
    setStatus(u.finding);
    try {
      await yieldToPaint();
      const found = planStitch(list.map((it) => it.shot.signature));
      setPlan(found);

      setStatus(u.painting);
      await yieldToPaint();
      const shots = list.map((it) => it.shot);
      revoke();

      if (output() === 'pdf') {
        const sliceHeight = sliceHeightFor(found.width);
        const slices = slicePages(found.height, sliceHeight);
        const canvas = document.createElement('canvas');
        const bytes = await buildPdf(slices, found.width, async (slice) => {
          composeSlice(found, shots, slice.y, slice.h, canvas);
          return new Uint8Array(await (await encodeCanvas(canvas, 'image/jpeg')).arrayBuffer());
        });
        canvas.width = 0;
        canvas.height = 0;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        setResult({
          url: URL.createObjectURL(blob),
          bytes: blob.size,
          extension: 'pdf',
          size: null,
          pages: slices.length,
        });
        setStatus(fmt(u.donePdf, { pages: slices.length, size: kb(blob.size) }));
      } else {
        const type = output() === 'png' ? 'image/png' : 'image/jpeg';
        const composed = composePlan(found, shots);
        setShrunkTo(composed.scale);
        const blob = await encodeCanvas(composed.canvas, type);
        const size = { w: composed.canvas.width, h: composed.canvas.height };
        composed.canvas.width = 0;
        composed.canvas.height = 0;
        setResult({
          url: URL.createObjectURL(blob),
          bytes: blob.size,
          extension: output() === 'png' ? 'png' : 'jpg',
          size,
          pages: 1,
        });
        setStatus(fmt(u.doneImage, { w: size.w, h: size.h, size: kb(blob.size) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : u.failed);
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={ScreenshotStitchPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="stitch-files">
            {u.pickLabel}
          </label>
          <input
            id="stitch-files"
            type="file"
            accept="image/*"
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
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-fg">{item.name}</span>
                      <span class="block text-xs text-muted">
                        {fmt(u.rowMeta, {
                          w: item.shot.naturalWidth,
                          h: item.shot.naturalHeight,
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
            <p class="mt-2 text-xs text-muted">
              {fmt(u.summary, { files: items().length })} {u.orderHint}
            </p>
          </div>
        </Show>

        <div>
          <p class="mb-2 text-sm font-medium">{u.outputLabel}</p>
          <SegmentedControl
            aria-label={u.outputLabel}
            options={[
              { value: 'png', label: u.outputPng },
              { value: 'jpeg', label: u.outputJpeg },
              { value: 'pdf', label: u.outputPdf },
            ]}
            value={output()}
            onChange={(v: string) => setOutput(v as Output)}
          />
          <p class="mt-2 text-xs text-muted">{u.outputHint}</p>
        </div>

        {/* Says why the button is dim, rather than leaving it dim and unexplained. */}
        <Show when={items().length === 1}>
          <p class="text-xs text-muted">{u.needTwo}</p>
        </Show>

        <Show when={degraded()}>
          <p class="text-xs text-muted">{u.degraded}</p>
        </Show>

        <Button onClick={() => void run()} disabled={busy() || items().length < 2}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={notes().length > 0}>
          <div class="rounded border border-border bg-surface p-3">
            <p class="text-sm font-semibold text-fg">{u.seamsHeading}</p>
            <ul class="mt-1 list-none space-y-1 p-0 text-sm text-muted">
              <For each={notes()}>{(line) => <li>{line}</li>}</For>
            </ul>
          </div>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-3">
              <a
                href={r().url}
                download={stitchedName(
                  items().map((it) => it.name),
                  r().extension,
                )}
                class="inline-flex items-center rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
              >
                {fmt(u.download, { size: kb(r().bytes) })}
              </a>
              <p class="text-xs text-muted">{u.verifyHint}</p>
              <Show when={r().size}>
                <img
                  src={r().url}
                  alt={u.previewAlt}
                  class="max-h-96 rounded border border-border"
                />
              </Show>
            </div>
          )}
        </Show>
      </div>

      <ToolContent route="screenshot-stitch" />
    </main>
  );
}
