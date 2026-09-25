import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { MermaidEditorPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles } from '../../lib/paste';
import { createEditor, type DiagramEditor } from '@core/diagram/editor';
import { renderDiagram, rasterise, standaloneSvg, loadMermaid, type DiagramTheme } from '@core/diagram/render';
import type { DiagramError } from '@core/diagram/errors';
import { fileBase, pngSize, type PngUse } from '@core/diagram/export';
import { canShare, makeShare, readShare } from '@core/diagram/share';
import { diagramFromText, isDiagramFile } from '@core/diagram/intake';
import { STARTERS, STARTER_IDS, type StarterId } from '@core/diagram/starters';
import { fitView, zoomAt, type View } from '@core/diagram/viewport';

/**
 * Mermaid source on one side, the diagram on the other.
 *
 * The preview never goes blank on a half-typed line. A failed render keeps the
 * last diagram that worked, dimmed and labelled, and the error goes on the
 * line in the editor; the alternative, which most Mermaid editors do, flashes
 * an error picture on every keystroke between "A -" and "A --> B".
 *
 * The view is fitted once when a diagram arrives (a file, an example, a link,
 * the first render) and then left alone, so typing into a large diagram does
 * not keep throwing the zoom back out.
 */

// Start fetching Mermaid the moment this route's code arrives, alongside the
// editor, rather than after the editor has mounted.
if (typeof window !== 'undefined') void loadMermaid().catch(() => {});

const DRAFT_KEY = 'yappykit-mermaid-draft';
const RENDER_DELAY = 250;

type Look = 'auto' | DiagramTheme;
const LOOKS: { value: Look; key: 'lookAuto' | 'lookDefault' | 'lookDark' | 'lookNeutral' | 'lookForest' }[] = [
  { value: 'auto', key: 'lookAuto' },
  { value: 'default', key: 'lookDefault' },
  { value: 'dark', key: 'lookDark' },
  { value: 'neutral', key: 'lookNeutral' },
  { value: 'forest', key: 'lookForest' },
];

const PNG_USES: { value: PngUse; key: 'pngDocument' | 'pngSlides' | 'pngPrint' }[] = [
  { value: 'document', key: 'pngDocument' },
  { value: 'slides', key: 'pngSlides' },
  { value: 'print', key: 'pngPrint' },
];

function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function writeDraft(text: string) {
  try {
    localStorage.setItem(DRAFT_KEY, text);
  } catch {
    // Private mode or storage full: the draft just is not kept.
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pageIsDark = () => document.documentElement.dataset.theme === 'dark';

interface Drawn {
  svg: string;
  width: number;
  height: number;
  background: string;
}

export default function MermaidEditor() {
  const { m, fmt } = useI18n();
  const tt = m.tools['mermaid-editor'];
  const u = tt.ui;
  useSeo('mermaid-editor');

  const [source, setSource] = createSignal('');
  const [fileName, setFileName] = createSignal('');
  const [look, setLook] = createSignal<Look>('auto');
  const [dark, setDark] = createSignal(false);
  const [drawn, setDrawn] = createSignal<Drawn | null>(null);
  const [error, setError] = createSignal<DiagramError | null>(null);
  const [engine, setEngine] = createSignal<'loading' | 'ready' | 'failed'>('loading');
  const [note, setNote] = createSignal('');
  const [view, setView] = createSignal<View>({ scale: 1, x: 0, y: 0 });
  const [pngUse, setPngUse] = createSignal<PngUse>('document');
  const [exporting, setExporting] = createSignal(false);
  const shareable = typeof window !== 'undefined' && canShare();
  const canCopyImage = typeof window !== 'undefined' && 'ClipboardItem' in window && !!navigator.clipboard?.write;

  let editorHost: HTMLDivElement | undefined;
  let viewport: HTMLDivElement | undefined;
  let stage: HTMLDivElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let editor: DiagramEditor | undefined;
  let needsFit = true;
  let seq = 0;

  const theme = (): DiagramTheme => {
    const l = look();
    return l === 'auto' ? (dark() ? 'dark' : 'default') : l;
  };

  const fit = () => {
    const d = drawn();
    if (!d || !viewport) return;
    setView(fitView(d.width, d.height, viewport.clientWidth, viewport.clientHeight));
  };

  /** Replace the editor's text as one undoable step, and refit on the next render. */
  const load = (text: string, name?: string) => {
    needsFit = true;
    if (name !== undefined) setFileName(name);
    editor?.setText(text);
  };

  onMount(() => {
    setDark(pageIsDark());
    const observer = new MutationObserver(() => setDark(pageIsDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    onCleanup(() => observer.disconnect());

    const initial = readDraft() ?? STARTERS.flowchart;
    setSource(initial);
    editor = createEditor({
      parent: editorHost!,
      text: initial,
      label: u.editorLabel,
      placeholder: u.placeholder,
      onChange: (text) => {
        setSource(text);
        writeDraft(text);
      },
      onSave: save,
    });
    onCleanup(() => editor?.destroy());

    loadMermaid().then(
      () => setEngine('ready'),
      () => setEngine('failed'),
    );

    // A share link opens on top of the draft, as an edit, so the draft that
    // was there is one Undo away rather than overwritten. A link followed from
    // this page only changes the hash, so that is listened for as well.
    const openShared = () => {
      const hash = location.hash;
      if (!hash.startsWith('#code=')) return;
      history.replaceState(null, '', location.pathname + location.search);
      void readShare(hash).then((shared) => {
        if (shared === null) {
          setNote(u.sharedBroken);
        } else if (shared !== source()) {
          load(shared);
          setNote(u.sharedOpened);
        }
      });
    };
    openShared();
    window.addEventListener('hashchange', openShared);
    onCleanup(() => window.removeEventListener('hashchange', openShared));

    const ro = new ResizeObserver(() => {
      if (needsFit) fit();
    });
    ro.observe(viewport!);
    onCleanup(() => ro.disconnect());
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  createEffect(
    on([source, theme, engine], ([text, th, eng]) => {
      clearTimeout(timer);
      if (eng !== 'ready') return;
      // Empty goes through the delay too: replacing all the text can arrive as
      // a delete then an insert, and the diagram must not blink out between.
      // With nothing on screen yet nobody is mid-keystroke, so draw at once.
      timer = setTimeout(async () => {
        const mine = ++seq;
        if (!text.trim()) {
          setDrawn(null);
          setError(null);
          editor?.markError(null, null, '');
          return;
        }
        const result = await renderDiagram(text, th);
        if (mine !== seq) return;
        if (result.ok) {
          setDrawn({ svg: result.svg, width: result.width, height: result.height, background: result.background });
          setError(null);
          editor?.markError(null, null, '');
          if (needsFit) {
            fit();
            needsFit = false;
          }
        } else {
          setError(result.error);
          editor?.markError(result.error.line, result.error.column, result.error.detail);
        }
      }, drawn() || error() ? RENDER_DELAY : 0);
    }),
  );

  // The SVG goes in by hand: it is Mermaid's sanitised output, sized here to
  // its drawn size so the stage's transform is the only thing scaling it.
  createEffect(() => {
    const d = drawn();
    if (!stage) return;
    stage.innerHTML = d ? d.svg : '';
    const el = stage.querySelector('svg');
    if (el && d) {
      el.setAttribute('width', String(d.width));
      el.setAttribute('height', String(d.height));
      el.style.maxWidth = 'none';
      el.style.display = 'block';
    }
  });

  async function read(file: File) {
    try {
      const got = diagramFromText(await file.text());
      load(got.text, file.name);
      setNote(fmt(got.fromMarkdown ? u.openedFromMarkdown : u.opened, { name: file.name }));
    } catch {
      setNote(fmt(u.unreadable, { name: file.name }));
    }
  }

  usePasteFiles(isDiagramFile, (files) => {
    const first = files[0];
    if (first) void read(first);
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) await read(file);
  }

  function onStarter(e: Event & { currentTarget: HTMLSelectElement }) {
    const id = e.currentTarget.value as StarterId;
    // Back to the prompt, so choosing the same example again still fires.
    e.currentTarget.selectedIndex = 0;
    if (!STARTERS[id]) return;
    load(STARTERS[id], '');
    setNote(fmt(u.starterLoaded, { name: u.starters[id] }));
  }

  function save() {
    const name = fileBase(source(), fileName()) + '.mmd';
    download(new Blob([source()], { type: 'text/plain' }), name);
    setNote(fmt(u.saved, { name }));
  }

  async function copyLink() {
    const url = `${location.origin}${location.pathname}#${await makeShare(source())}`;
    try {
      await navigator.clipboard.writeText(url);
      setNote(u.linkCopied);
    } catch {
      history.replaceState(null, '', url);
      setNote(u.linkInAddressBar);
    }
  }

  function fixType(word: string, type: string, line: number) {
    const doc = editor?.view.state.doc;
    if (!doc || line > doc.lines) return;
    const l = doc.line(line);
    const at = l.text.indexOf(word);
    if (at < 0) return;
    editor!.view.dispatch({ changes: { from: l.from + at, to: l.from + at + word.length, insert: type } });
  }

  const pngDims = () => {
    const d = drawn();
    return d ? pngSize(d.width, d.height, pngUse()) : { width: 0, height: 0 };
  };

  async function downloadPng() {
    const d = drawn();
    if (!d) return;
    setExporting(true);
    try {
      download(await rasterise(d.svg, pngDims(), d.background), fileBase(source(), fileName()) + '.png');
    } catch {
      setNote(u.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  function downloadSvg() {
    const d = drawn();
    if (!d) return;
    const file = standaloneSvg(d.svg, d.width, d.height, d.background);
    download(new Blob([file], { type: 'image/svg+xml' }), fileBase(source(), fileName()) + '.svg');
  }

  async function copyImage() {
    const d = drawn();
    if (!d) return;
    const dims = pngDims();
    try {
      // The pending blob, not an awaited one: Safari only allows the write
      // while the click that asked for it is still being handled.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': rasterise(d.svg, dims, d.background) })]);
      setNote(fmt(u.imageCopied, { width: dims.width, height: dims.height }));
    } catch {
      setNote(u.copyFailed);
    }
  }

  // ---- Pan and zoom ----------------------------------------------------------

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const zoomBy = (factor: number) => {
    if (!viewport) return;
    setView((v) => zoomAt(v, factor, viewport!.clientWidth / 2, viewport!.clientHeight / 2));
  };

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    viewport!.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      setView((v) => ({ ...v, x: v.x + p.x - prev.x, y: v.y + p.y - prev.y }));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch > 0) setView((v) => zoomAt(v, d / pinch, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2));
      pinch = d;
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    pinch = 0;
  }

  function onWheel(e: WheelEvent) {
    // Plain scrolling keeps scrolling the page past the preview; Ctrl (which
    // is also what a trackpad pinch reports) zooms.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = local(e);
    setView((v) => zoomAt(v, Math.exp(-e.deltaY / 300), p.x, p.y));
  }

  function onPreviewKey(e: KeyboardEvent) {
    const step = 40;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-') zoomBy(0.8);
    else if (e.key === '0') fit();
    else if (moves[e.key]) {
      const [dx, dy] = moves[e.key]!;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else return;
    e.preventDefault();
  }

  onMount(() => {
    // Not a JSX handler: Solid delegates or attaches wheel listeners as
    // passive, and a passive listener cannot stop the browser's own zoom.
    viewport!.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => viewport?.removeEventListener('wheel', onWheel));
  });

  const errorHeadline = (e: DiagramError) => {
    if (e.kind === 'unknown-type' && e.line) return fmt(u.unknownType, { line: e.line, word: e.word ?? '' });
    if (e.kind === 'front-matter' && e.line) return fmt(u.frontMatter, { line: e.line });
    return e.line ? fmt(u.errorLine, { line: e.line }) : u.errorNoLine;
  };

  const toolbarButton =
    'inline-flex min-h-11 cursor-pointer items-center rounded border border-border bg-bg px-3 text-sm font-medium text-fg hover:bg-accent-soft disabled:cursor-default disabled:opacity-50 lg:min-h-9';
  // 44 px targets for touch; the wide two-pane layout is a mouse layout.
  const selectClass = 'min-h-11 rounded border border-border bg-bg px-2 text-sm text-fg lg:min-h-9';

  return (
    <main class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <ToolHero title={tt.heroTitle} tool="mermaid-editor" preview={MermaidEditorPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 grid gap-4 lg:grid-cols-2">
        <section class="flex min-w-0 flex-col" aria-label={u.editorLabel}>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <select class={selectClass} aria-label={u.startFrom} onChange={onStarter}>
              <option value="" disabled selected>
                {u.startFromPrompt}
              </option>
              <For each={STARTER_IDS}>{(id) => <option value={id}>{u.starters[id]}</option>}</For>
            </select>
            <button type="button" class={toolbarButton} onClick={() => fileInput?.click()}>
              {u.open}
            </button>
            <input
              ref={fileInput}
              type="file"
              class="hidden"
              accept=".mmd,.mermaid,.md,.markdown,.txt,text/plain,text/markdown"
              onChange={(e) => void onPick(e)}
            />
            <button type="button" class={toolbarButton} onClick={save} disabled={!source().trim()}>
              {u.save}
            </button>
            <Show when={shareable}>
              <button type="button" class={toolbarButton} onClick={() => void copyLink()} disabled={!source().trim()}>
                {u.copyLink}
              </button>
            </Show>
          </div>
          {/* One fixed-height box: the error takes its space from the editor
              rather than landing below the fold of a tall editor. */}
          <div class="flex h-[45vh] min-h-72 flex-col overflow-hidden rounded border border-border lg:h-[65vh]">
            <div ref={editorHost} class="min-h-0 flex-1" data-editor />
            <Show when={error()}>
              {(e) => (
                <div class="max-h-[45%] shrink-0 overflow-auto border-t border-danger bg-danger-soft p-3 text-sm text-fg" role="alert" data-error>
                  <p class="m-0 font-medium">{errorHeadline(e())}</p>
                  <Show when={e().kind === 'unknown-type'}>
                    <p class="mb-0 mt-1">{u.unknownTypeHint}</p>
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <Show when={e().kind === 'unknown-type' && e().suggestion && e().line}>
                      <button
                        type="button"
                        class={toolbarButton}
                        onClick={() => fixType(e().word!, e().suggestion!, e().line!)}
                      >
                        {fmt(u.useType, { type: e().suggestion! })}
                      </button>
                    </Show>
                    <Show when={e().line}>
                      <button type="button" class={toolbarButton} onClick={() => editor?.goToLine(e().line!)}>
                        {fmt(u.goToLine, { line: e().line! })}
                      </button>
                    </Show>
                  </div>
                  <Show when={e().kind !== 'unknown-type' && e().detail}>
                    <details class="mt-2">
                      <summary class="cursor-pointer text-xs text-muted">{u.detailLabel}</summary>
                      <p class="mb-0 mt-1 break-words font-mono text-xs">{e().detail}</p>
                    </details>
                  </Show>
                </div>
              )}
            </Show>
          </div>
          <p class="mt-2 text-xs text-muted">{u.draftHint}</p>
        </section>

        <section class="flex min-w-0 flex-col" aria-label={u.previewLabel}>
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <select
              class={selectClass}
              aria-label={u.lookLabel}
              value={look()}
              onChange={(e) => setLook(e.currentTarget.value as Look)}
            >
              <For each={LOOKS}>{(l) => <option value={l.value}>{`${u.lookLabel}: ${u[l.key]}`}</option>}</For>
            </select>
            <div class="ms-auto flex items-center gap-1">
              <button type="button" class={toolbarButton} onClick={() => zoomBy(0.8)} aria-label={u.zoomOut} title={u.zoomOut}>
                −
              </button>
              <button
                type="button"
                class={`${toolbarButton} min-w-16 justify-center tabular-nums`}
                onClick={() => setView((v) => zoomAt(v, 1 / v.scale, viewport!.clientWidth / 2, viewport!.clientHeight / 2))}
                title={u.actualSize}
                aria-label={u.actualSize}
              >
                {Math.round(view().scale * 100)}%
              </button>
              <button type="button" class={toolbarButton} onClick={() => zoomBy(1.25)} aria-label={u.zoomIn} title={u.zoomIn}>
                +
              </button>
              <button type="button" class={toolbarButton} onClick={fit}>
                {u.fit}
              </button>
            </div>
          </div>
          <div
            ref={viewport}
            tabindex="0"
            role="group"
            aria-label={u.previewLabel}
            aria-describedby="diagram-pan-hint"
            class="relative h-[45vh] min-h-72 cursor-grab touch-none select-none overflow-hidden rounded border border-border active:cursor-grabbing lg:h-[65vh]"
            style={{ 'background-color': drawn()?.background ?? 'var(--zen-color-background)' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onPreviewKey}
            onDblClick={fit}
            data-preview
          >
            <div
              ref={stage}
              class="absolute left-0 top-0 origin-top-left transition-opacity"
              classList={{ 'opacity-40': !!error() }}
              style={{ transform: `translate(${view().x}px, ${view().y}px) scale(${view().scale})` }}
              data-stage
            />
            <Show when={error() && drawn()}>
              <p class="absolute left-2 top-2 m-0 rounded bg-bg px-2 py-1 text-xs font-medium text-fg shadow" data-stale>
                {u.stale}
              </p>
            </Show>
            <Show when={engine() !== 'ready' || !drawn()}>
              <p class="absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-sm text-muted">
                {engine() === 'loading'
                  ? u.loadingEngine
                  : engine() === 'failed'
                    ? u.engineFailed
                    : !source().trim()
                      ? u.empty
                      : error()
                        ? errorHeadline(error()!)
                        : ''}
              </p>
            </Show>
          </div>
          <p id="diagram-pan-hint" class="mt-2 text-xs text-muted">
            {u.panHint}
          </p>
        </section>
      </div>

      <section class="mt-6 rounded-lg border border-border p-4" aria-labelledby="diagram-export">
        <h2 id="diagram-export" class="m-0 text-base font-semibold">
          {u.exportHeading}
        </h2>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <span class="text-sm font-medium">{u.pngUseLabel}</span>
          <SegmentedControl
            aria-label={u.pngUseLabel}
            options={PNG_USES.map((p) => ({ value: p.value, label: u[p.key] }))}
            value={pngUse()}
            onChange={setPngUse}
          />
        </div>
        <p class="mt-2 text-xs text-muted">{u.pngHint}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void downloadPng()} disabled={!drawn() || exporting()}>
            {fmt(u.downloadPng, { width: pngDims().width, height: pngDims().height })}
          </Button>
          <Show when={canCopyImage}>
            <button type="button" class={toolbarButton} onClick={() => void copyImage()} disabled={!drawn()}>
              {u.copyImage}
            </button>
          </Show>
          <button type="button" class={toolbarButton} onClick={downloadSvg} disabled={!drawn()}>
            {u.downloadSvg}
          </button>
        </div>
      </section>

      <p class="mt-4 min-h-5 text-sm text-fg" role="status" data-note>
        {note()}
      </p>

      <ToolContent route="mermaid-editor" />
    </main>
  );
}
