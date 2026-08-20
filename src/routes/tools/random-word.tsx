import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import {
  CONCRETE_NOUNS, ABSTRACT_NOUNS, ACTION_VERBS, ADJECTIVES, ALL_WORDS,
} from '@core/words/corpus';
import {
  cryptoRandom, seededRandom, sample, createDealer, filterWords, entropyBits,
  crackTime, passphrase, makeSeed, normalizeSeed, PASSPHRASE_POOL,
  type Dealer, type Passphrase, type WordFilter,
} from '@core/words/generate';

/**
 * Random word generator.
 *
 * FOUR OUTCOMES, NOT ONE FORM. People arrive here wanting one of four different
 * things — a list to pick from, a card to draw or mime, a nudge for a piece of
 * writing, or a passphrase they can actually remember — and the settings that
 * serve one are noise to the other three. So the mode is the first control and
 * everything else follows from it, rather than presenting one page of every
 * knob at once.
 *
 * The three things this does that the incumbents do not:
 *
 *   - A DRAW CAN BE SHARED. A seed code reproduces a draw exactly, so thirty
 *     pupils or a table of players get the same words with no account, no link
 *     shortener and no server. The passphrase mode is structurally excluded from
 *     it (see generate.ts) because a reproducible passphrase is not a secret.
 *   - NOTHING REPEATS. Game mode deals a shuffled deck, so a round of Pictionary
 *     does not hand out "elephant" twice.
 *   - THE STRENGTH FIGURE IS COMPUTED, NOT DECORATIVE. Entropy comes from the
 *     size of the pool actually drawn from and is shown alongside how long the
 *     phrase survives an offline attack.
 *
 * Everything runs in this tab. No word list is fetched and no generated word is
 * sent anywhere, which for the passphrase mode is the whole ballgame.
 */

type Mode = 'list' | 'game' | 'prompt' | 'passphrase';
type Kind = 'all' | 'nouns' | 'verbs' | 'adjectives' | 'abstract';
type GameKind = 'things' | 'actions' | 'both';

const POOLS: Record<Kind, readonly string[]> = {
  all: ALL_WORDS,
  nouns: CONCRETE_NOUNS,
  verbs: ACTION_VERBS,
  adjectives: ADJECTIVES,
  abstract: ABSTRACT_NOUNS,
};

const SEPARATORS = ['-', '.', '_', ' '] as const;

export default function RandomWord() {
  const { m, fmt, locale } = useI18n();
  const t = m.tools['random-word'];
  const u = t.ui;
  useSeo('random-word');

  const [mode, setMode] = createSignal<Mode>('list');

  // ── Shared draw settings ────────────────────────────────────────────────
  const [kind, setKind] = createSignal<Kind>('all');
  const [count, setCount] = createSignal(10);
  const [startsWith, setStartsWith] = createSignal('');
  const [endsWith, setEndsWith] = createSignal('');
  const [minLength, setMinLength] = createSignal(0);
  const [maxLength, setMaxLength] = createSignal(0);
  const [seed, setSeed] = createSignal('');
  const [seedInput, setSeedInput] = createSignal('');

  const filter = createMemo<WordFilter>(() => ({
    startsWith: startsWith(),
    endsWith: endsWith(),
    minLength: minLength() || undefined,
    maxLength: maxLength() || undefined,
  }));

  /** The words a draw can actually come from, after the filters. */
  const pool = createMemo(() => filterWords(POOLS[kind()], filter()));

  /**
   * A seeded draw must be reproducible, so it needs a fresh generator each time
   * from the same seed; an unseeded one wants a new crypto draw every press.
   */
  const random = () => (seed() ? seededRandom(seed()) : cryptoRandom());

  // ── List mode ───────────────────────────────────────────────────────────
  const [words, setWords] = createSignal<string[]>([]);

  function drawList() {
    setWords(sample(pool(), count(), random()));
  }

  // ── Game mode ───────────────────────────────────────────────────────────
  const [gameKind, setGameKind] = createSignal<GameKind>('both');
  const [card, setCard] = createSignal<string | null>(null);
  const [dealt, setDealt] = createSignal(0);
  let dealer: Dealer | null = null;

  const gamePool = createMemo(() => {
    const k = gameKind();
    return k === 'things' ? CONCRETE_NOUNS
      : k === 'actions' ? ACTION_VERBS
      : [...CONCRETE_NOUNS, ...ACTION_VERBS];
  });

  function newDeck() {
    dealer = createDealer(gamePool(), random());
    setDealt(0);
    setCard(null);
  }

  function nextCard() {
    if (!dealer) newDeck();
    setCard(dealer!.next());
    // Derived from the deck rather than counted up, so that when the dealer
    // exhausts the deck and reshuffles, the tally restarts with it instead of
    // reading "900 dealt of 843".
    setDealt(gamePool().length - dealer!.remaining());
  }

  // Space and the arrow keys are how a party game is actually driven — nobody
  // is aiming a mouse at a button between rounds. Ignored while typing, so the
  // seed box does not deal a card on every space.
  function onKey(e: KeyboardEvent) {
    if (mode() !== 'game') return;
    const el = e.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      nextCard();
    }
  }
  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  // ── Prompt mode ─────────────────────────────────────────────────────────
  interface Prompt { adjective: string; noun: string; verb: string; idea: string }
  const [prompt, setPrompt] = createSignal<Prompt | null>(null);

  function drawPrompt() {
    const rnd = random();
    setPrompt({
      adjective: sample(ADJECTIVES, 1, rnd)[0]!,
      noun: sample(CONCRETE_NOUNS, 1, rnd)[0]!,
      verb: sample(ACTION_VERBS, 1, rnd)[0]!,
      idea: sample(ABSTRACT_NOUNS, 1, rnd)[0]!,
    });
  }

  // ── Passphrase mode ─────────────────────────────────────────────────────
  const [ppCount, setPpCount] = createSignal(8);
  const [ppSeparator, setPpSeparator] = createSignal<string>('-');
  const [ppCapitalize, setPpCapitalize] = createSignal(false);
  const [ppNumber, setPpNumber] = createSignal(false);
  const [phrase, setPhrase] = createSignal<Passphrase | null>(null);

  function drawPassphrase() {
    setPhrase(passphrase({
      count: ppCount(),
      separator: ppSeparator(),
      capitalize: ppCapitalize(),
      addNumber: ppNumber(),
    }));
  }

  /** Strength of the CURRENT settings, so the readout moves before you press. */
  const liveBits = createMemo(() => entropyBits(PASSPHRASE_POOL.length, ppCount()));

  /**
   * Say the crack time in the reader's language.
   *
   * The unit names come out of `crackTime` already spelled the way
   * Intl.NumberFormat wants them, so plurals are the platform's problem rather
   * than a translator's — which is the only way "5 лет" and "2 года" both come
   * out right. Compact notation takes over once the numbers stop being
   * countable: "20 Mrd. Jahre" beats twelve digits.
   */
  function crackText(bits: number): string {
    const { unit, value } = crackTime(bits);
    if (unit === 'instant') return u.crackInstant;
    if (unit === 'beyond') return u.crackBeyond;
    const time = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
      notation: value >= 1e6 ? 'compact' : 'standard',
      maximumFractionDigits: 0,
    }).format(value);
    return fmt(u.crackAbout, { time });
  }

  // ── Copying ─────────────────────────────────────────────────────────────
  const [copied, setCopied] = createSignal('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Firefox without clipboard permission, and any insecure context. A
      // selected textarea still lets the user press Ctrl+C, which beats a
      // button that silently does nothing.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(what);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => setCopied(''), 1600);
  }
  onCleanup(() => clearTimeout(copyTimer));

  // ── The shareable seed ──────────────────────────────────────────────────
  // Read on mount so a shared link reproduces the draw immediately, and written
  // with replaceState so pressing "generate" does not fill the back button with
  // near-identical history entries.
  onMount(() => {
    const q = new URLSearchParams(window.location.search);
    const shared = q.get('seed');
    if (!shared) return;
    const code = normalizeSeed(shared);
    setSeed(code);
    setSeedInput(code);
    if (q.get('kind')) setKind(q.get('kind') as Kind);
    const n = Number(q.get('n'));
    if (Number.isFinite(n) && n > 0) setCount(Math.min(100, Math.round(n)));
    if (q.get('sw')) setStartsWith(q.get('sw')!);
    if (q.get('ew')) setEndsWith(q.get('ew')!);
    drawList();
  });

  function shareUrl(): string {
    const q = new URLSearchParams({ seed: seed(), kind: kind(), n: String(count()) });
    if (startsWith()) q.set('sw', startsWith());
    if (endsWith()) q.set('ew', endsWith());
    return `${window.location.origin}${window.location.pathname}?${q}`;
  }

  function lockSeed() {
    const code = seedInput().trim() ? normalizeSeed(seedInput()) : makeSeed();
    setSeed(code);
    setSeedInput(code);
    if (mode() === 'game') newDeck();
    else if (mode() === 'prompt') drawPrompt();
    else drawList();
  }

  function unlockSeed() {
    setSeed('');
    setSeedInput('');
    history.replaceState(null, '', window.location.pathname);
  }

  const modeOptions = () => [
    { value: 'list' as const, label: u.modeList },
    { value: 'game' as const, label: u.modeGame },
    { value: 'prompt' as const, label: u.modePrompt },
    { value: 'passphrase' as const, label: u.modePassphrase },
  ];

  // min-h-11 keeps every control at the 44px tap target the segmented control
  // and the buttons already use; a native select renders at 32px otherwise.
  const fieldClass =
    'min-h-11 rounded border border-border bg-bg px-2 py-1.5 text-sm text-fg';
  const secondaryButton =
    'inline-flex min-h-11 items-center rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition hover:border-accent';

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-6">
        {/* Four modes are wider than a 320px screen. The control scrolls
            inside its own box so the PAGE never scrolls sideways. */}
        <div class="-mx-6 overflow-x-auto px-6">
          <SegmentedControl
            options={modeOptions()}
            value={mode()}
            onChange={(v) => setMode(v)}
            aria-label={u.modeLabel}
          />
        </div>

        {/* ── List ─────────────────────────────────────────────────────── */}
        <Show when={mode() === 'list'}>
          <section class="space-y-4">
            <div class="flex flex-wrap items-end gap-4">
              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">{u.kindLabel}</span>
                <select
                  class={fieldClass}
                  value={kind()}
                  onChange={(e) => setKind(e.currentTarget.value as Kind)}
                >
                  <option value="all">{u.kindAll}</option>
                  <option value="nouns">{u.kindNouns}</option>
                  <option value="verbs">{u.kindVerbs}</option>
                  <option value="adjectives">{u.kindAdjectives}</option>
                  <option value="abstract">{u.kindAbstract}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">{u.countLabel}</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  class={`${fieldClass} w-24`}
                  value={count()}
                  onInput={(e) => setCount(Math.min(100, Math.max(1, Number(e.currentTarget.value) || 1)))}
                />
              </label>
              <Button onClick={drawList}>{u.generate}</Button>
            </div>

            <details class="rounded border border-border bg-surface p-3">
              <summary class="cursor-pointer text-sm font-medium">{u.moreFilters}</summary>
              <div class="mt-3 flex flex-wrap gap-4">
                <label class="flex flex-col gap-1 text-sm">
                  <span>{u.startsWith}</span>
                  <input
                    class={`${fieldClass} w-24`}
                    maxLength={4}
                    value={startsWith()}
                    onInput={(e) => setStartsWith(e.currentTarget.value)}
                  />
                </label>
                <label class="flex flex-col gap-1 text-sm">
                  <span>{u.endsWith}</span>
                  <input
                    class={`${fieldClass} w-24`}
                    maxLength={4}
                    value={endsWith()}
                    onInput={(e) => setEndsWith(e.currentTarget.value)}
                  />
                </label>
                <label class="flex flex-col gap-1 text-sm">
                  <span>{u.minLength}</span>
                  <input
                    type="number"
                    min="0"
                    max="14"
                    class={`${fieldClass} w-20`}
                    value={minLength()}
                    onInput={(e) => setMinLength(Math.max(0, Number(e.currentTarget.value) || 0))}
                  />
                </label>
                <label class="flex flex-col gap-1 text-sm">
                  <span>{u.maxLength}</span>
                  <input
                    type="number"
                    min="0"
                    max="14"
                    class={`${fieldClass} w-20`}
                    value={maxLength()}
                    onInput={(e) => setMaxLength(Math.max(0, Number(e.currentTarget.value) || 0))}
                  />
                </label>
              </div>
              {/* The pool size is shown because it is the honest answer to "why
                  did I only get four words" and, in seeded draws, the thing that
                  must match for two people to see the same list. */}
              <p class="mt-3 text-xs text-muted">{fmt(u.poolCount, { n: pool().length })}</p>
            </details>

            <Show when={words().length > 0} fallback={<p class="text-sm text-muted">{u.listEmpty}</p>}>
              <div>
                <ul class="flex flex-wrap gap-2 p-0" aria-live="polite">
                  <For each={words()}>
                    {(word) => (
                      <li class="list-none">
                        <button
                          type="button"
                          onClick={() => void copy(word, word)}
                          title={u.clickToCopy}
                          class="inline-flex min-h-11 cursor-pointer items-center rounded border border-border bg-surface px-3 py-1.5 text-base text-fg transition hover:border-accent"
                        >
                          {word}
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
                <div class="mt-3 flex items-center gap-3">
                  <button type="button" class={secondaryButton} onClick={() => void copy(words().join('\n'), 'all')}>
                    {u.copyAll}
                  </button>
                  <Show when={copied()}>
                    <span class="text-sm text-success" role="status">{u.copied}</span>
                  </Show>
                </div>
              </div>
            </Show>
            <Show when={pool().length === 0}>
              <p class="rounded border border-danger bg-danger-soft p-3 text-sm" role="alert">{u.noMatches}</p>
            </Show>
          </section>
        </Show>

        {/* ── Game ─────────────────────────────────────────────────────── */}
        <Show when={mode() === 'game'}>
          <section class="space-y-4">
            <div class="flex flex-wrap items-end gap-4">
              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">{u.gameKindLabel}</span>
                <select
                  class={fieldClass}
                  value={gameKind()}
                  onChange={(e) => {
                    setGameKind(e.currentTarget.value as GameKind);
                    newDeck();
                  }}
                >
                  <option value="both">{u.gameBoth}</option>
                  <option value="things">{u.gameThings}</option>
                  <option value="actions">{u.gameActions}</option>
                </select>
              </label>
              <Button onClick={nextCard}>{card() ? u.gameNext : u.gameStart}</Button>
              <button type="button" class={secondaryButton} onClick={newDeck}>{u.gameShuffle}</button>
            </div>

            <div
              class="flex min-h-48 items-center justify-center rounded-lg border border-border bg-surface p-6 text-center"
              aria-live="polite"
            >
              <Show
                when={card()}
                fallback={<p class="text-sm text-muted">{u.gameIdle}</p>}
              >
                {(word) => (
                  <p class="break-words text-4xl font-bold tracking-tight sm:text-6xl">{word()}</p>
                )}
              </Show>
            </div>

            <p class="text-xs text-muted">
              {fmt(u.gameDealt, { dealt: dealt(), total: gamePool().length })} · {u.gameHint}
            </p>
          </section>
        </Show>

        {/* ── Prompt ───────────────────────────────────────────────────── */}
        <Show when={mode() === 'prompt'}>
          <section class="space-y-4">
            <Button onClick={drawPrompt}>{prompt() ? u.promptAgain : u.promptStart}</Button>
            <Show
              when={prompt()}
              fallback={<p class="text-sm text-muted">{u.promptIdle}</p>}
            >
              {(p) => (
                <div class="space-y-4">
                  <div class="grid gap-3 sm:grid-cols-4" aria-live="polite">
                    <For
                      each={[
                        { label: u.promptAdjective, word: p().adjective },
                        { label: u.promptNoun, word: p().noun },
                        { label: u.promptVerb, word: p().verb },
                        { label: u.promptIdea, word: p().idea },
                      ]}
                    >
                      {(cell) => (
                        <div class="rounded-lg border border-border bg-surface p-3">
                          <p class="text-xs uppercase tracking-wide text-muted">{cell.label}</p>
                          <p class="mt-1 text-xl font-semibold">{cell.word}</p>
                        </div>
                      )}
                    </For>
                  </div>
                  <p class="max-w-prose text-sm text-muted">{u.promptHint}</p>
                </div>
              )}
            </Show>
          </section>
        </Show>

        {/* ── Passphrase ───────────────────────────────────────────────── */}
        <Show when={mode() === 'passphrase'}>
          <section class="space-y-4">
            <div class="flex flex-wrap items-end gap-4">
              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">{u.ppWords}</span>
                <input
                  type="number"
                  min="3"
                  max="24"
                  class={`${fieldClass} w-24`}
                  value={ppCount()}
                  onInput={(e) => setPpCount(Math.min(24, Math.max(3, Number(e.currentTarget.value) || 3)))}
                />
              </label>
              <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">{u.ppSeparator}</span>
                <select
                  class={fieldClass}
                  value={ppSeparator()}
                  onChange={(e) => setPpSeparator(e.currentTarget.value)}
                >
                  <For each={SEPARATORS}>
                    {(s) => <option value={s}>{s === ' ' ? u.ppSpace : s}</option>}
                  </For>
                </select>
              </label>
              <label class="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={ppCapitalize()} onChange={(e) => setPpCapitalize(e.currentTarget.checked)} />
                {u.ppCapitalize}
              </label>
              <label class="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={ppNumber()} onChange={(e) => setPpNumber(e.currentTarget.checked)} />
                {u.ppNumber}
              </label>
              <Button onClick={drawPassphrase}>{u.ppGenerate}</Button>
            </div>

            <Show when={phrase()} fallback={<p class="text-sm text-muted">{u.ppIdle}</p>}>
              {(p) => (
                <div class="rounded-lg border border-border bg-surface p-4">
                  <p class="break-all font-mono text-xl font-semibold sm:text-2xl" aria-live="polite">
                    {p().text}
                  </p>
                  <div class="mt-3 flex items-center gap-3">
                    <button type="button" class={secondaryButton} onClick={() => void copy(p().text, 'pp')}>
                      {u.copy}
                    </button>
                    <Show when={copied()}>
                      <span class="text-sm text-success" role="status">{u.copied}</span>
                    </Show>
                  </div>
                </div>
              )}
            </Show>

            {/* Strength tracks the CONTROLS, not the last result, so raising the
                word count shows what it buys before anything is generated. */}
            <div class="rounded border border-border p-3 text-sm">
              <p>{fmt(u.ppStrength, { bits: liveBits().toFixed(1) })}</p>
              <p class="mt-1 text-muted">{crackText(liveBits())}</p>
              <p class="mt-1 text-xs text-muted">
                {fmt(u.ppPoolNote, { n: PASSPHRASE_POOL.length, bits: (liveBits() / ppCount()).toFixed(2) })}
              </p>
              <Show when={liveBits() < 70}>
                <p class="mt-2 text-xs text-danger">{u.ppWeak}</p>
              </Show>
            </div>
            <p class="text-xs text-muted">{u.ppPrivacy}</p>
          </section>
        </Show>

        {/* ── Shared seed, for every mode except the one where it would be a
             security hole ──────────────────────────────────────────────── */}
        <Show when={mode() !== 'passphrase'}>
          <section class="rounded-lg border border-border bg-surface p-4">
            <h2 class="text-base font-semibold">{u.seedHeading}</h2>
            <p class="mt-1 max-w-prose text-xs text-muted">{u.seedHint}</p>
            <div class="mt-3 flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1 text-sm">
                <span>{u.seedLabel}</span>
                <input
                  class={`${fieldClass} w-40 font-mono`}
                  placeholder={u.seedPlaceholder}
                  value={seedInput()}
                  onInput={(e) => setSeedInput(e.currentTarget.value)}
                />
              </label>
              <button type="button" class={secondaryButton} onClick={lockSeed}>{u.seedApply}</button>
              <Show when={seed()}>
                <button type="button" class={secondaryButton} onClick={() => void copy(shareUrl(), 'link')}>
                  {u.seedCopyLink}
                </button>
                <button type="button" class={secondaryButton} onClick={unlockSeed}>{u.seedClear}</button>
              </Show>
            </div>
            <Show when={seed()}>
              <p class="mt-3 text-sm" role="status">{fmt(u.seedActive, { seed: seed() })}</p>
            </Show>
          </section>
        </Show>
      </div>

      <ToolContent route="random-word" />
    </main>
  );
}
