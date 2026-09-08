import { createSignal, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { MarkdownToPdfPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { usePasteFiles } from '../../lib/paste';
import { buildMarkdownPdf, pdfName, titleOf, type Paper } from '@core/markdown/pdf';

/**
 * Markdown into a laid-out PDF.
 *
 * Two ways in, because Markdown arrives both ways: a README picked off disk,
 * or a block of it on the clipboard from a notes app or a chat window. The
 * textarea is the second one, and it is also where someone can fix a typo
 * before they make the document rather than editing the file and coming back.
 *
 * The only question asked is what the page should be, which matches the image
 * to PDF tool next door. Type sizes and page breaks are core/markdown/pdf's
 * business — see the note there on why none of that is a slider.
 */

const kb = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** What can be read as Markdown. A .txt file is Markdown that uses none of it. */
const MARKDOWN = /\.(md|markdown|mdown|mkd|mkdn|txt|text)$/i;

const isMarkdownFile = (f: File) =>
  f.type === 'text/markdown' || f.type === 'text/plain' || MARKDOWN.test(f.name);

const TARGETS = [
  { value: 'a4' as const, labelKey: 'paperA4' as const },
  { value: 'letter' as const, labelKey: 'paperLetter' as const },
];

export default function MarkdownToPdf() {
  const { m, fmt } = useI18n();
  const tt = m.tools['markdown-to-pdf'];
  const u = tt.ui;
  useSeo('markdown-to-pdf');

  const [source, setSource] = createSignal('');
  const [fileName, setFileName] = createSignal('');
  const [paper, setPaper] = createSignal<Paper>('a4');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [status, setStatus] = createSignal('');
  const [unsupported, setUnsupported] = createSignal<string[]>([]);
  const [result, setResult] = createSignal<{
    url: string;
    name: string;
    bytes: number;
    pages: number;
  } | null>(null);

  const revoke = () => {
    const r = result();
    if (r) URL.revokeObjectURL(r.url);
  };
  onCleanup(revoke);

  /** Any change to the source invalidates a PDF built from the old one. */
  const replace = (text: string, name?: string) => {
    revoke();
    setResult(null);
    setStatus('');
    setError('');
    setUnsupported([]);
    setSource(text);
    if (name !== undefined) setFileName(name);
  };

  async function read(file: File) {
    try {
      replace(await file.text(), file.name);
    } catch {
      setError(fmt(u.unreadable, { name: file.name }));
    }
  }

  usePasteFiles(isMarkdownFile, (files) => {
    const first = files[0];
    if (first) void read(first);
  });

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    // Clear the input so picking the same file again after an edit still fires.
    e.currentTarget.value = '';
    if (file) await read(file);
  }

  async function run() {
    const text = source();
    if (!text.trim()) {
      setError(u.nothingToConvert);
      return;
    }
    setBusy(true);
    setError('');
    setStatus(u.working);
    try {
      const title = titleOf(text);
      const out = await buildMarkdownPdf(text, { paper: paper(), title });
      revoke();
      const name = pdfName(fileName() || 'document.md', title);
      setResult({
        url: URL.createObjectURL(new Blob([out.bytes as BlobPart], { type: 'application/pdf' })),
        name,
        bytes: out.bytes.byteLength,
        pages: out.pages,
      });
      setUnsupported(out.unsupported);
      setStatus(
        fmt(u.doneStatus, {
          pages: out.pages === 1 ? u.pagesOne : fmt(u.pagesMany, { n: out.pages }),
          size: kb(out.bytes.byteLength),
        }),
      );
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? err.message : u.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={MarkdownToPdfPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="markdown-file">
            {u.pickLabel}
          </label>
          <input
            id="markdown-file"
            type="file"
            accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain"
            onChange={(e) => void onPick(e)}
            class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pickHint}</p>
          <Show when={fileName()}>
            <p class="mt-2 text-xs text-muted">{fileName()}</p>
          </Show>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium" for="markdown-source">
            {u.pasteLabel}
          </label>
          <textarea
            id="markdown-source"
            rows="10"
            spellcheck={false}
            value={source()}
            onInput={(e) => replace(e.currentTarget.value)}
            placeholder={u.pastePlaceholder}
            class="block w-full rounded border border-border bg-surface p-3 font-mono text-sm text-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.pasteHint}</p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium">{u.paperLabel}</p>
          <SegmentedControl
            aria-label={u.paperLabel}
            options={TARGETS.map((t) => ({ value: t.value, label: u[t.labelKey] }))}
            value={paper()}
            onChange={setPaper}
          />
          <p class="mt-2 text-xs text-muted">{u.paperHint}</p>
        </div>

        <Button onClick={() => void run()} disabled={busy() || !source().trim()}>
          {busy() ? u.working : u.action}
        </Button>

        <Show when={error()}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">{error()}</p>
        </Show>

        <Show when={status()}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            {status()}
          </p>
        </Show>

        <Show when={unsupported().length > 0}>
          <p class="rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            {fmt(u.unsupported, { chars: unsupported().slice(0, 12).join(' ') })}
          </p>
        </Show>

        <Show when={result()}>
          {(r) => (
            <a
              href={r().url}
              download={r().name}
              class="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-accent-fg no-underline"
            >
              {fmt(u.download, { name: r().name, size: kb(r().bytes) })}
            </a>
          )}
        </Show>

        <ul class="list-none space-y-1 p-0 text-xs text-muted">
          <For each={u.supports}>{(line) => <li>{line}</li>}</For>
        </ul>
      </div>

      <ToolContent route="markdown-to-pdf" />
    </main>
  );
}
