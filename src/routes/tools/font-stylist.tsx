import { createSignal, createMemo, onCleanup, onMount, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { FontStylePreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities, evaluate, type CapabilitySpec } from '@core/capability';
import { blobSource, readFonts, FontFormatError, type FontEntry, type FontFormatCode } from '@core/font';
import { scanInstalledFonts, LocalFontsError } from '@core/font/local';
import { rankByFeel, FEEL_IDS, type FeelId, type TraitId, type StyleMatch } from '@core/font/style';

/**
 * Which of your fonts feels the way you want.
 *
 * The outcome is the feeling, so that is the only thing the interface asks for.
 * There is no weight slider and no serif dropdown, because a person choosing a
 * typeface for an invitation is not thinking in width classes, and the numbers
 * are what the engine solves for rather than what the user supplies.
 *
 * The traits do appear, but only as the EXPLANATION of a result. That is the
 * line this tool has to walk: reading a font's characteristics is measurement
 * and ranking them against a feeling is judgement, so the judgement is shown
 * rather than asserted.
 */

const SPEC: CapabilitySpec = {
  required: [],
  preferred: ['localFonts'],
};

const MAX_PARTIAL_SHOWN = 24;

export default function FontStylist() {
  const { m, fmt } = useI18n();
  const tt = m.tools['font-style'];
  const u = tt.ui;
  useSeo('font-style');

  const [feel, setFeel] = createSignal<FeelId>('elegant');
  const [sample, setSample] = createSignal(u.sampleText);
  const [fonts, setFonts] = createSignal<FontEntry[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [progress, setProgress] = createSignal<{ done: number; total: number } | null>(null);
  const [notes, setNotes] = createSignal<string[]>([]);
  const [problems, setProblems] = createSignal<string[]>([]);
  const [canScan, setCanScan] = createSignal(false);
  const [fileFamilies, setFileFamilies] = createSignal(new Map<string, string>());
  const registered: FontFace[] = [];

  onMount(() => setCanScan(evaluate(SPEC, detectCapabilities()).fastPath));
  onCleanup(() => {
    for (const face of registered) document.fonts.delete(face);
  });

  const report = createMemo(() => rankByFeel(fonts(), feel()));

  const FEEL_LABELS: Record<FeelId, string> = {
    elegant: u.feelElegant,
    authoritative: u.feelAuthoritative,
    friendly: u.feelFriendly,
    technical: u.feelTechnical,
    loud: u.feelLoud,
    quiet: u.feelQuiet,
  };

  const TRAIT_LABELS: Record<TraitId, string> = {
    category: u.traitCategory,
    weight: u.traitWeight,
    width: u.traitWidth,
    xheight: u.traitXheight,
    contrast: u.traitContrast,
    slant: u.traitSlant,
  };

  const traitList = (ids: TraitId[]) => ids.map((id) => TRAIT_LABELS[id]).join(', ');

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
        metrics: true,
        onProgress: (done, total) => setProgress({ done, total }),
      });
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
          metrics: true,
        });
        added.push(...entries);
        // A collection previews as whichever face the browser picks, so it gets
        // no specimen rather than a misleading one. Same rule as the checker.
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

  async function register(file: File): Promise<string | null> {
    const family = `yk-style-${registered.length + 1}`;
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

  /** Installed faces are addressed by full name; quotes are stripped because it came out of a file. */
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

  const Row = (props: { match: StyleMatch }) => (
    <li class="rounded border border-border bg-surface p-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-semibold text-fg">{props.match.font.fullName}</span>
        <span class="text-xs text-muted">
          {props.match.font.origin === 'installed'
            ? u.installedBadge
            : (props.match.font.fileName ?? '')}
        </span>
      </div>
      <p
        class="mt-2 truncate text-2xl leading-relaxed text-fg"
        aria-label={fmt(u.specimenLabel, { font: props.match.font.fullName })}
        style={{ 'font-family': cssFamily(props.match.font) }}
      >
        {sample()}
      </p>
      <p class="mt-2 text-xs text-success">
        {fmt(u.matchedLabel, { traits: traitList(props.match.score.matched) })}
      </p>
      <Show when={props.match.score.missed.length > 0}>
        <p class="mt-1 text-xs text-danger">
          {fmt(u.missedLabel, { traits: traitList(props.match.score.missed) })}
        </p>
      </Show>
      <Show when={props.match.score.unknown.length > 0}>
        <p class="mt-1 text-xs text-muted">
          {fmt(u.unknownLabel, { traits: traitList(props.match.score.unknown) })}
        </p>
      </Show>
    </li>
  );

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <ToolHero title={tt.heroTitle} preview={FontStylePreview}>
        {tt.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-6">
        <div>
          <p class="mb-2 text-sm font-medium">{u.feelLabel}</p>
          <div role="radiogroup" aria-label={u.feelLabel} class="flex flex-wrap gap-2">
            <For each={FEEL_IDS}>
              {(id) => {
                const selected = () => feel() === id;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected()}
                    onClick={() => setFeel(id)}
                    class={`m-0 flex min-h-11 cursor-pointer appearance-none items-center rounded border px-3.5 py-2 text-sm font-medium transition-colors ${
                      selected()
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border bg-surface text-fg hover:bg-accent-soft'
                    }`}
                  >
                    {FEEL_LABELS[id]}
                  </button>
                );
              }}
            </For>
          </div>
          <p class="mt-2 text-xs text-muted">{u.feelHint}</p>
        </div>

        <div class="space-y-3 border-t border-border pt-6">
          <p class="text-sm font-medium">{u.sourcesHeading}</p>

          <Show when={canScan()} fallback={<p class="text-xs text-muted">{u.scanUnsupported}</p>}>
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
            <label class="mb-2 block text-sm font-medium" for="style-files">
              {u.filesLabel}
            </label>
            <input
              id="style-files"
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

        <Show when={fonts().length > 0} fallback={<p class="text-sm text-muted">{u.noFonts}</p>}>
          <div class="space-y-6 border-t border-border pt-6">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div class="min-w-56 flex-1">
                <label class="mb-2 block text-sm font-medium" for="style-sample">
                  {u.sampleLabel}
                </label>
                <input
                  id="style-sample"
                  type="text"
                  value={sample()}
                  onInput={(e) => setSample(e.currentTarget.value)}
                  class="block w-full rounded border border-border bg-surface p-2 text-sm text-fg"
                />
              </div>
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
            </div>

            <div>
              <h2 class="text-lg font-bold">{u.strongHeading}</h2>
              <p class="mt-1 text-sm text-muted">
                {fmt(u.strongCount, { n: report().strong.length, total: fonts().length })}
              </p>
              <Show
                when={report().strong.length > 0}
                fallback={<p class="mt-3 text-sm text-muted">{u.strongEmpty}</p>}
              >
                <ul class="mt-3 list-none space-y-2 p-0">
                  <For each={report().strong}>{(match) => <Row match={match} />}</For>
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
                    {(match) => <Row match={match} />}
                  </For>
                </ul>
              </div>
            </Show>

            <Show when={report().weak > 0}>
              <p class="text-sm text-muted">{fmt(u.weakNote, { n: report().weak })}</p>
            </Show>

            <Show when={report().unclassified.length > 0}>
              <div>
                <h2 class="text-lg font-bold">{u.unclassifiedHeading}</h2>
                <p class="mt-1 text-sm text-muted">{u.unclassifiedNote}</p>
                <ul class="mt-3 flex list-none flex-wrap gap-2 p-0">
                  <For each={report().unclassified}>
                    {(match) => (
                      <li class="rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-muted">
                        {match.font.fullName}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <ToolContent route="font-style" />
    </main>
  );
}
