import { createSignal, createMemo, onCleanup, onMount, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { FontFinderPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate, type CapabilitySpec } from '@core/capability';
import {
  blobSource,
  codepointLabel,
  matchFonts,
  readFonts,
  requiredCharacters,
  FontFormatError,
  type FontEntry,
  type FontFormatCode,
} from '@core/font';
import { scanInstalledFonts, LocalFontsError } from '@core/font/local';

/**
 * Which of your fonts can render this text.
 *
 * The interface asks for the OUTCOME, which here is the text itself: paste what
 * has to be set and the tool works out what it demands and who can supply it.
 * There is no character-range picker and no script dropdown, because a person
 * with a name that will not render does not know that the problem is called
 * Latin Extended-A.
 *
 * Installed fonts are behind a button rather than read on load. The Local Font
 * Access API needs a user gesture and a permission, and it deserves one: the
 * list of fonts on a machine is a strong fingerprint. The file path below it
 * needs no permission and works in every browser, so the tool is never useless.
 */

const SPEC: CapabilitySpec = {
  required: [],
  preferred: ['localFonts'],
};

/** Missing characters are chips, and a hundred of them is not a list any more. */
const MAX_MISSING_SHOWN = 12;
/** The near misses are worth reading; the four hundred outright failures are not. */
const MAX_PARTIAL_SHOWN = 24;

export default function FontFinder() {
  const { m, fmt } = useI18n();
  const tt = m.tools['font-find'];
  const u = tt.ui;
  useSeo('font-find');

  const [text, setText] = createSignal(u.sampleText);
  const [fonts, setFonts] = createSignal<FontEntry[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal<{ done: number; total: number } | null>(null);
  const [notes, setNotes] = createSignal<string[]>([]);
  const [problems, setProblems] = createSignal<string[]>([]);
  const [canScan, setCanScan] = createSignal(false);

  // CSS family per source file, for the specimen. Installed faces are named
  // directly; a file has to be registered with the document first.
  const [fileFamilies, setFileFamilies] = createSignal(new Map<string, string>());
  const registered: FontFace[] = [];

  onMount(() => setCanScan(evaluate(SPEC, detectCapabilities()).fastPath));
  onCleanup(() => {
    for (const face of registered) document.fonts.delete(face);
  });

  const required = createMemo(() => requiredCharacters(text()));
  const report = createMemo(() => matchFonts(fonts(), required()));

  function reasonFor(code: FontFormatCode): string {
    if (code === 'woff2') return u.reasonWoff2;
    if (code === 'damaged') return u.reasonDamaged;
    return u.reasonUnknown;
  }

  async function scan() {
    setBusy(true);
    setProblems([]);
    setProgress({ done: 0, total: 0 });
    try {
      const { entries, unreadable } = await scanInstalledFonts({
        onProgress: (done, total) => setProgress({ done, total }),
      });
      // A rescan replaces the installed set rather than doubling it; files the
      // user added by hand are theirs to keep.
      setFonts([...fonts().filter((f) => f.origin === 'file'), ...entries]);
      const lines = [fmt(u.scanDone, { fonts: entries.length })];
      if (unreadable > 0) lines.push(fmt(u.scanSkipped, { n: unreadable }));
      setNotes(lines);
    } catch (err) {
      const code = err instanceof LocalFontsError ? err.code : 'failed';
      setProblems([
        code === 'denied' ? u.scanDenied : code === 'unsupported' ? u.scanUnsupported : u.scanFailed,
      ]);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onPick(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    // Clearing the input lets the same file be added again after a reset.
    e.currentTarget.value = '';
    if (files.length === 0) return;

    setBusy(true);
    const added: FontEntry[] = [];
    const failed: string[] = [];
    const families = new Map(fileFamilies());

    for (const file of files) {
      try {
        const entries = await readFonts(blobSource(file), {
          origin: 'file',
          fileName: file.name,
        });
        added.push(...entries);
        // A collection holds several faces and a FontFace can only be given the
        // whole file, so it would preview every member as the first one. Better
        // no specimen than a misleading one.
        if (entries.length === 1) {
          const family = await register(file);
          if (family) families.set(file.name, family);
        }
      } catch (err) {
        const code = err instanceof FontFormatError ? err.code : 'unknown';
        failed.push(fmt(u.fileFailed, { name: file.name, reason: reasonFor(code) }));
      }
    }

    setFileFamilies(families);
    setFonts([...fonts(), ...added]);
    setProblems(failed);
    setBusy(false);
  }

  /** Make a font file drawable, under a name of ours so it cannot shadow a real family. */
  async function register(file: File): Promise<string | null> {
    const family = `yk-font-${registered.length + 1}`;
    try {
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      registered.push(face);
      return family;
    } catch {
      return null;
    }
  }

  /**
   * The specimen's font-family. Installed faces are addressed by their full
   * name, which is what selects one weight rather than the whole family.
   * Quotes and backslashes are stripped: the name comes out of a font file,
   * which is not something to interpolate into a style unexamined.
   */
  const cssFamily = (entry: FontEntry): string => {
    if (entry.origin === 'file') {
      const family = entry.fileName ? fileFamilies().get(entry.fileName) : undefined;
      return family ?? 'inherit';
    }
    return `"${entry.fullName.replace(/["\\]/g, '')}"`;
  };

  const clear = () => {
    setFonts([]);
    setNotes([]);
    setProblems([]);
    setFileFamilies(new Map());
  };

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={FontFinderPreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <label class="mb-2 block text-sm font-medium" for="font-text">
            {u.textLabel}
          </label>
          <textarea
            id="font-text"
            rows="3"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            class="block w-full rounded border border-border bg-surface p-3 text-base text-fg"
          />
          <p class="mt-2 text-xs text-muted">{u.textHint}</p>
        </div>

        <div>
          <p class="text-sm font-medium">{u.charsHeading}</p>
          <Show when={required().length > 0} fallback={<p class="mt-2 text-sm text-muted">{u.charsEmpty}</p>}>
            <ul class="mt-2 flex list-none flex-wrap gap-1.5 p-0">
              <For each={required()}>
                {(c) => (
                  <li
                    title={codepointLabel(c.codepoint)}
                    class="flex h-9 min-w-9 items-center justify-center rounded border border-border bg-surface px-2 text-base text-fg"
                  >
                    {c.char}
                  </li>
                )}
              </For>
            </ul>
            <p class="mt-2 text-xs text-muted">
              {fmt(u.charsSummary, { chars: required().length })} {u.charsNote}
            </p>
          </Show>
        </div>

        <div class="space-y-3 border-t border-border pt-6">
          <p class="text-sm font-medium">{u.sourcesHeading}</p>

          <Show
            when={canScan()}
            fallback={<p class="text-xs text-muted">{u.scanUnsupported}</p>}
          >
            <div>
              <Button onClick={() => void scan()} disabled={busy()}>
                {progress()
                  ? fmt(u.scanBusy, { done: progress()!.done, total: progress()!.total })
                  : u.scanAction}
              </Button>
              <p class="mt-2 text-xs text-muted">{u.scanHint}</p>
            </div>
          </Show>

          <div>
            <label class="mb-2 block text-sm font-medium" for="font-files">
              {u.filesLabel}
            </label>
            <input
              id="font-files"
              type="file"
              accept=".ttf,.otf,.ttc,.woff,.woff2,font/ttf,font/otf,font/woff"
              multiple
              onChange={(e) => void onPick(e)}
              class="block w-full cursor-pointer rounded border border-border bg-surface p-2 text-sm text-fg file:me-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-accent-fg"
            />
            <p class="mt-2 text-xs text-muted">{u.filesHint}</p>
          </div>
        </div>

        <Show when={problems().length > 0}>
          <ul class="list-none space-y-1 rounded border border-danger bg-danger-soft p-3 text-sm text-fg">
            <For each={problems()}>{(line) => <li>{line}</li>}</For>
          </ul>
        </Show>

        <Show when={notes().length > 0}>
          <p class="rounded border border-border bg-surface p-3 text-sm text-fg" role="status">
            <For each={notes()}>{(line) => <span>{line} </span>}</For>
          </p>
        </Show>

        <Show
          when={fonts().length > 0}
          fallback={<p class="text-sm text-muted">{u.noFonts}</p>}
        >
          <div class="space-y-6 border-t border-border pt-6">
            <p class="text-sm text-muted">
              {fmt(u.fontsLoaded, { fonts: fonts().length })}{' '}
              <button
                type="button"
                onClick={clear}
                class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
              >
                {u.clear}
              </button>
            </p>

            <div>
              <h2 class="text-lg font-bold">{u.completeHeading}</h2>
              <p class="mt-1 text-sm text-muted">
                {fmt(u.completeCount, { n: report().complete.length, total: fonts().length })}
              </p>
              <Show
                when={report().complete.length > 0}
                fallback={<p class="mt-3 text-sm text-muted">{u.completeEmpty}</p>}
              >
                <ul class="mt-3 list-none space-y-2 p-0">
                  <For each={report().complete}>
                    {(match) => (
                      <li class="rounded border border-border bg-surface p-3">
                        <div class="flex flex-wrap items-baseline justify-between gap-2">
                          <span class="text-sm font-semibold text-fg">{match.font.fullName}</span>
                          <span class="text-xs text-muted">
                            {match.font.origin === 'installed'
                              ? u.installedBadge
                              : (match.font.fileName ?? '')}
                          </span>
                        </div>
                        <p
                          class="mt-2 truncate text-xl leading-relaxed text-fg"
                          aria-label={fmt(u.specimenLabel, { font: match.font.fullName })}
                          style={{ 'font-family': cssFamily(match.font) }}
                        >
                          {text()}
                        </p>
                        <p class="mt-1 text-xs text-muted">
                          {fmt(u.glyphs, { n: match.font.glyphCount })}
                          <Show when={match.font.symbolic}> {u.symbolic}</Show>
                        </p>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>

            <Show when={report().partial.length > 0}>
              <div>
                <h2 class="text-lg font-bold">{u.partialHeading}</h2>
                <Show when={report().partial.length > MAX_PARTIAL_SHOWN}>
                  <p class="mt-1 text-sm text-muted">
                    {fmt(u.showingSome, {
                      shown: MAX_PARTIAL_SHOWN,
                      total: report().partial.length,
                    })}
                  </p>
                </Show>
                <ul class="mt-3 list-none space-y-2 p-0">
                  <For each={report().partial.slice(0, MAX_PARTIAL_SHOWN)}>
                    {(match) => (
                      <li class="rounded border border-border bg-surface p-3">
                        <div class="flex flex-wrap items-baseline justify-between gap-2">
                          <span class="text-sm font-semibold text-fg">{match.font.fullName}</span>
                          <span class="text-xs text-muted">
                            {match.font.origin === 'installed'
                              ? u.installedBadge
                              : (match.font.fileName ?? '')}
                          </span>
                        </div>
                        <p class="mt-2 text-xs text-muted">
                          {fmt(u.missingLabel, { n: match.missing.length })}
                        </p>
                        <ul class="mt-1 flex list-none flex-wrap items-center gap-1.5 p-0">
                          <For each={match.missing.slice(0, MAX_MISSING_SHOWN)}>
                            {(cp) => (
                              <li
                                title={codepointLabel(cp)}
                                class="flex h-8 min-w-8 items-center justify-center rounded border border-danger px-1.5 text-base text-fg"
                              >
                                {String.fromCodePoint(cp)}
                              </li>
                            )}
                          </For>
                          <Show when={match.missing.length > MAX_MISSING_SHOWN}>
                            <li class="text-xs text-muted">
                              {fmt(u.andMore, { n: match.missing.length - MAX_MISSING_SHOWN })}
                            </li>
                          </Show>
                        </ul>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <ToolContent route="font-find" />
    </main>
  );
}
