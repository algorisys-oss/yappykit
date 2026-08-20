import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { analyseChatter, rolloverClass } from '@core/input/diagnostics';

/**
 * Keyboard tester — dead keys, stuck keys, rollover and raw key codes.
 *
 * LAYOUT ACCURACY. Keys are tracked by `event.code` (the PHYSICAL key) rather
 * than `event.key` (what it produced), so highlighting is correct on every
 * layout — pressing the key labelled "A" on AZERTY lights the same box whatever
 * character it emits. The printed legends are a separate problem: the drawing
 * below is ANSI/ISO US by default, which is wrong for AZERTY, QWERTZ and the
 * rest. Where the browser supports the Keyboard Map API
 * (`navigator.keyboard.getLayoutMap()`, Chromium) we relabel every key with the
 * legend the user's own layout produces; elsewhere we say so rather than
 * quietly showing US legends as though they were theirs.
 *
 * Any key pressed that this drawing does not contain is listed separately, so a
 * keyboard with extra keys never has presses vanish silently.
 *
 * Keystrokes are read to drive the display and are never stored or sent — which
 * matters here more than most places, a keyboard tester being exactly the shape
 * of page a keylogger would wear.
 */

interface Key {
  code: string;
  label: string;
  /** Width in units (1 = a standard alphanumeric key). */
  w?: number;
  /** Height in units, for the ISO Enter and the numpad's tall keys. */
  h?: number;
}

type Variant = 'ansi' | 'iso';
type Size = 'full' | 'tkl';

const FN_ROW: Key[] = [
  { code: 'Escape', label: 'Esc' },
  { code: 'F1', label: 'F1' }, { code: 'F2', label: 'F2' }, { code: 'F3', label: 'F3' },
  { code: 'F4', label: 'F4' }, { code: 'F5', label: 'F5' }, { code: 'F6', label: 'F6' },
  { code: 'F7', label: 'F7' }, { code: 'F8', label: 'F8' }, { code: 'F9', label: 'F9' },
  { code: 'F10', label: 'F10' }, { code: 'F11', label: 'F11' }, { code: 'F12', label: 'F12' },
];

const NUM_ROW: Key[] = [
  { code: 'Backquote', label: '`' },
  ...'1234567890'.split('').map((d) => ({ code: `Digit${d}`, label: d })),
  { code: 'Minus', label: '-' }, { code: 'Equal', label: '=' },
  { code: 'Backspace', label: 'Backspace', w: 2 },
];

const Q_ROW: Key[] = [
  { code: 'Tab', label: 'Tab', w: 1.5 },
  ...'QWERTYUIOP'.split('').map((c) => ({ code: `Key${c}`, label: c })),
  { code: 'BracketLeft', label: '[' }, { code: 'BracketRight', label: ']' },
];

const A_ROW: Key[] = [
  { code: 'CapsLock', label: 'Caps', w: 1.75 },
  ...'ASDFGHJKL'.split('').map((c) => ({ code: `Key${c}`, label: c })),
  { code: 'Semicolon', label: ';' }, { code: 'Quote', label: "'" },
];

const Z_ROW_TAIL: Key[] = [
  ...'ZXCVBNM'.split('').map((c) => ({ code: `Key${c}`, label: c })),
  { code: 'Comma', label: ',' }, { code: 'Period', label: '.' }, { code: 'Slash', label: '/' },
];

const BOTTOM_ROW: Key[] = [
  { code: 'ControlLeft', label: 'Ctrl', w: 1.25 },
  { code: 'MetaLeft', label: 'Meta', w: 1.25 },
  { code: 'AltLeft', label: 'Alt', w: 1.25 },
  { code: 'Space', label: 'Space', w: 6.25 },
  { code: 'AltRight', label: 'Alt', w: 1.25 },
  { code: 'MetaRight', label: 'Meta', w: 1.25 },
  { code: 'ContextMenu', label: 'Menu', w: 1.25 },
  { code: 'ControlRight', label: 'Ctrl', w: 1.25 },
];

/**
 * The main block. ANSI and ISO genuinely differ in key COUNT, not just shape:
 * ISO adds IntlBackslash beside the left Shift and moves Backslash up beside a
 * tall Enter. Getting this wrong means a real key has nowhere to light up.
 */
function mainRows(variant: Variant): Key[][] {
  if (variant === 'iso') {
    return [
      FN_ROW,
      NUM_ROW,
      [...Q_ROW, { code: 'Enter', label: 'Enter', w: 1.5, h: 2 }],
      [...A_ROW, { code: 'Backslash', label: '\\' }],
      [
        { code: 'ShiftLeft', label: 'Shift', w: 1.25 },
        { code: 'IntlBackslash', label: '\\' },
        ...Z_ROW_TAIL,
        { code: 'ShiftRight', label: 'Shift', w: 2.75 },
      ],
      BOTTOM_ROW,
    ];
  }
  return [
    FN_ROW,
    NUM_ROW,
    [...Q_ROW, { code: 'Backslash', label: '\\', w: 1.5 }],
    [...A_ROW, { code: 'Enter', label: 'Enter', w: 2.25 }],
    [
      { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
      ...Z_ROW_TAIL,
      { code: 'ShiftRight', label: 'Shift', w: 2.75 },
    ],
    BOTTOM_ROW,
  ];
}

const NAV_ROWS: Key[][] = [
  [{ code: 'PrintScreen', label: 'PrtSc' }, { code: 'ScrollLock', label: 'ScrLk' }, { code: 'Pause', label: 'Pause' }],
  [{ code: 'Insert', label: 'Ins' }, { code: 'Home', label: 'Home' }, { code: 'PageUp', label: 'PgUp' }],
  [{ code: 'Delete', label: 'Del' }, { code: 'End', label: 'End' }, { code: 'PageDown', label: 'PgDn' }],
  [],
  [{ code: '', label: '' }, { code: 'ArrowUp', label: '↑' }, { code: '', label: '' }],
  [{ code: 'ArrowLeft', label: '←' }, { code: 'ArrowDown', label: '↓' }, { code: 'ArrowRight', label: '→' }],
];

const NUMPAD_ROWS: Key[][] = [
  [{ code: 'NumLock', label: 'Num' }, { code: 'NumpadDivide', label: '/' }, { code: 'NumpadMultiply', label: '*' }, { code: 'NumpadSubtract', label: '-' }],
  [{ code: 'Numpad7', label: '7' }, { code: 'Numpad8', label: '8' }, { code: 'Numpad9', label: '9' }, { code: 'NumpadAdd', label: '+', h: 2 }],
  [{ code: 'Numpad4', label: '4' }, { code: 'Numpad5', label: '5' }, { code: 'Numpad6', label: '6' }],
  [{ code: 'Numpad1', label: '1' }, { code: 'Numpad2', label: '2' }, { code: 'Numpad3', label: '3' }, { code: 'NumpadEnter', label: '↵', h: 2 }],
  [{ code: 'Numpad0', label: '0', w: 2 }, { code: 'NumpadDecimal', label: '.' }],
];

export default function KeyboardTest() {
  const { m, fmt } = useI18n();
  const t = m.tools['keyboard-test'];
  useSeo('keyboard-test');

  const [held, setHeld] = createSignal<Set<string>>(new Set<string>());
  const [tested, setTested] = createSignal<Set<string>>(new Set<string>());
  const [last, setLast] = createSignal<KeyboardEvent | null>(null);
  const [maxHeld, setMaxHeld] = createSignal(0);
  const [variant, setVariant] = createSignal<Variant>('ansi');
  const [size, setSize] = createSignal<Size>('full');
  const [legends, setLegends] = createSignal<Map<string, string> | null>(null);
  // Per-key gaps between consecutive presses, for chatter detection.
  const [gaps, setGaps] = createSignal<Record<string, number[]>>({});
  const lastDown: Record<string, number> = {};

  const rows = createMemo(() => mainRows(variant()));

  /** Every code this drawing can display, for spotting presses it cannot. */
  const known = createMemo(() => {
    const s = new Set<string>();
    for (const r of rows()) for (const k of r) if (k.code) s.add(k.code);
    for (const r of NAV_ROWS) for (const k of r) if (k.code) s.add(k.code);
    if (size() === 'full') for (const r of NUMPAD_ROWS) for (const k of r) if (k.code) s.add(k.code);
    return s;
  });

  const extras = createMemo(() => [...tested()].filter((c) => !known().has(c)));
  const totalKeys = createMemo(() => known().size);

  /** The legend to print on a key: the user's real one when we can read it. */
  const legendFor = (k: Key) => {
    const map = legends();
    if (!map) return k.label;
    const real = map.get(k.code);
    if (!real) return k.label;
    // Only override single-character legends; the map returns unhelpfully long
    // names for modifiers on some platforms.
    return real.length <= 2 ? real.toUpperCase() : k.label;
  };

  function onDown(e: KeyboardEvent) {
    // Without this, Tab walks focus out of the page, Space scrolls and '/'
    // opens quick-find — none of which could then be tested.
    e.preventDefault();
    setLast(e);
    // Ignore auto-repeat: holding a key emits a stream of keydowns that would
    // otherwise look exactly like a chattering switch.
    if (!e.repeat) {
      const prev = lastDown[e.code];
      if (prev !== undefined) {
        const gap = Math.round(e.timeStamp - prev);
        setGaps((g) => ({ ...g, [e.code]: [...(g[e.code] ?? []), gap] }));
      }
      lastDown[e.code] = e.timeStamp;
    }
    // Compute the next set first: calling one setter inside another's updater
    // is a side effect during an update and did not reliably land.
    const next = new Set<string>(held()).add(e.code);
    setHeld(next);
    setMaxHeld((mx) => Math.max(mx, next.size));
    setTested((s) => new Set<string>(s).add(e.code));
  }

  function onUp(e: KeyboardEvent) {
    e.preventDefault();
    setHeld((h) => {
      const n = new Set<string>(h);
      n.delete(e.code);
      return n;
    });
  }

  onMount(() => {
    // Keyboard Map API: the only way a page can learn the user's real legends.
    // Chromium-only; absent elsewhere, and we tell the user rather than passing
    // US legends off as theirs.
    const kb = (navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
    }).keyboard;
    void kb?.getLayoutMap?.().then(setLegends).catch(() => setLegends(null));

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // A key held when the tab loses focus never emits keyup, which would show a
    // phantom stuck key. Clear on blur so the stuck-key reading stays truthful.
    const clear = () => setHeld(new Set<string>());
    window.addEventListener('blur', clear);
    onCleanup(() => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
    });
  });

  /** Keys whose presses arrived impossibly fast — a failing switch. */
  const chattering = createMemo(() =>
    Object.entries(gaps())
      .filter(([, g]) => analyseChatter(g).health === 'faulty')
      .map(([code]) => code),
  );

  function reset() {
    setHeld(new Set<string>());
    setTested(new Set<string>());
    setLast(null);
    setMaxHeld(0);
    setGaps({});
    for (const k of Object.keys(lastDown)) delete lastDown[k];
  }

  function downloadReport() {
    const untested = [...known()].filter((c) => !tested().has(c));
    const lines = [
      'YappyKit keyboard test report',
      `Generated: ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      `Layout drawn: ${variant().toUpperCase()}, ${size() === 'full' ? 'full size' : 'tenkeyless'}`,
      `Legends: ${legends() ? 'read from the OS layout' : 'US fallback'}`,
      '',
      `TESTED: ${[...tested()].filter((c) => known().has(c)).length} of ${totalKeys()}`,
      '',
      'KEYS THAT NEVER REGISTERED',
      untested.length ? `  ${untested.join(', ')}` : '  (none: every drawn key responded)',
      '',
      'CHATTERING KEYS',
      chattering().length ? `  ${chattering().join(', ')}` : '  (none detected)',
      '',
      'KEYS OUTSIDE THE DRAWN LAYOUT',
      extras().length ? `  ${extras().join(', ')}` : '  (none)',
      '',
      `ROLLOVER: ${rolloverClass(maxHeld())} (max ${maxHeld()} keys at once)`,
      '',
      'Measured locally in the browser. No keystroke was logged, stored or uploaded.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yappykit-keyboard-test.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const KeyCap = (props: { k: Key }) => {
    const isHeld = () => held().has(props.k.code);
    const isTested = () => tested().has(props.k.code);
    if (!props.k.code) return <div style={{ flex: `${props.k.w ?? 1} 0 0` }} />;
    return (
      <div
        style={{ flex: `${props.k.w ?? 1} 0 0` }}
        class={`flex h-10 select-none items-center justify-center rounded border text-xs font-medium transition-colors ${
          isHeld()
            ? 'border-accent bg-accent text-accent-fg'
            : isTested()
              ? 'border-success bg-success-soft text-fg'
              : 'border-border bg-bg text-muted'
        }`}
      >
        {legendFor(props.k)}
      </div>
    );
  };

  const Block = (props: { rows: Key[][] }) => (
    <div class="space-y-1">
      <For each={props.rows}>
        {(row) => (
          <div class="flex gap-1">
            <For each={row}>{(k) => <KeyCap k={k} />}</For>
          </div>
        )}
      </For>
    </div>
  );

  return (
    <main class="mx-auto max-w-5xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-6">
        <p class="text-sm text-muted">{t.ui.instructions}</p>

        <div class="flex flex-wrap items-end gap-6">
          <div>
            <p class="mb-2 text-sm font-medium">{t.ui.layoutLabel}</p>
            <SegmentedControl
              aria-label={t.ui.layoutLabel}
              options={[
                { value: 'ansi' as Variant, label: t.ui.layoutAnsi },
                { value: 'iso' as Variant, label: t.ui.layoutIso },
              ]}
              value={variant()}
              onChange={setVariant}
            />
          </div>
          <div>
            <p class="mb-2 text-sm font-medium">{t.ui.sizeLabel}</p>
            <SegmentedControl
              aria-label={t.ui.sizeLabel}
              options={[
                { value: 'full' as Size, label: t.ui.sizeFull },
                { value: 'tkl' as Size, label: t.ui.sizeTkl },
              ]}
              value={size()}
              onChange={setSize}
            />
          </div>
        </div>

        <p class="text-xs text-muted">{legends() ? t.ui.layoutDetected : t.ui.layoutAssumed}</p>

        <div class="overflow-x-auto rounded-lg border border-border bg-surface p-3">
          <div class="flex min-w-[56rem] gap-4">
            <div class="flex-[15]"><Block rows={rows()} /></div>
            <div class="flex-[3]"><Block rows={NAV_ROWS} /></div>
            <Show when={size() === 'full'}>
              <div class="flex-[4]"><Block rows={NUMPAD_ROWS} /></div>
            </Show>
          </div>
        </div>

        <ul class="flex list-none flex-wrap gap-4 p-0 text-xs text-muted">
          <li class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded border border-border bg-bg" />{t.ui.untestedLegend}</li>
          <li class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded border border-success bg-success-soft" />{t.ui.testedLegend}</li>
          <li class="flex items-center gap-2"><span class="inline-block h-3 w-3 rounded border border-accent bg-accent" />{t.ui.heldLegend}</li>
        </ul>

        <Show when={extras().length > 0}>
          <section class="rounded border border-border bg-surface p-3">
            <h2 class="text-sm font-semibold">{t.ui.extraHeading}</h2>
            <p class="mt-1 text-xs text-muted">{t.ui.extraBody}</p>
            <p class="mt-2 font-mono text-sm text-fg">{extras().join(', ')}</p>
          </section>
        </Show>

        <div class="grid gap-6 sm:grid-cols-2">
          <section>
            <h2 class="text-base font-semibold">{t.ui.lastKeyHeading}</h2>
            <Show when={last()} fallback={<p class="mt-2 text-sm text-muted">{t.ui.nonePressed}</p>}>
              {(e) => (
                <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt class="text-muted">{t.ui.keyLabel}</dt>
                  <dd class="font-mono text-fg">{e().key === ' ' ? 'Space' : e().key}</dd>
                  <dt class="text-muted">{t.ui.codeLabel}</dt>
                  <dd class="font-mono text-fg">{e().code}</dd>
                  <dt class="text-muted">{t.ui.keyCodeLabel}</dt>
                  <dd class="font-mono text-fg">{e().keyCode}</dd>
                  <dt class="text-muted">{t.ui.locationLabel}</dt>
                  <dd class="font-mono text-fg">{e().location}</dd>
                </dl>
              )}
            </Show>
          </section>

          <section>
            <h2 class="text-base font-semibold">{t.ui.testedHeading}</h2>
            <p class="mt-2 text-sm text-fg">
              {fmt(t.ui.testedCount, { tested: [...tested()].filter((c) => known().has(c)).length, total: totalKeys() })}
            </p>
            <h3 class="mt-4 text-sm font-semibold">{t.ui.rolloverHeading}</h3>
            <p class="mt-1 text-xs text-muted">{t.ui.rolloverBody}</p>
            <p class="mt-1 text-sm text-fg">{fmt(t.ui.rolloverBest, { n: maxHeld() })}</p>
            <p class="mt-1 text-sm font-medium text-accent">
              {fmt(t.ui.rolloverClass, { cls: rolloverClass(maxHeld()) })}
            </p>
          </section>
        </div>

        <section
          class={`rounded-lg border p-4 ${
            chattering().length ? 'border-danger bg-danger-soft' : 'border-border bg-surface'
          }`}
        >
          <h2 class="text-base font-semibold">{t.ui.chatterHeading}</h2>
          <p class="mt-1 text-sm text-fg" role="status">
            <Show when={chattering().length} fallback={t.ui.chatterNone}>
              {fmt(t.ui.chatterFound, { keys: chattering().join(', ') })}
            </Show>
          </p>
        </section>

        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="text-base font-semibold">{t.ui.reportHeading}</h2>
          <p class="mt-1 text-xs text-muted">{t.ui.reportHint}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button onClick={downloadReport}>{t.ui.reportButton}</Button>
          </div>
        </section>

        <Show when={held().size > 0}>
          <p class="rounded border border-border bg-surface p-3 text-sm" role="status">
            {t.ui.pressedHeading}: <span class="font-mono">{[...held()].join(', ')}</span>
          </p>
        </Show>

        <p class="text-xs text-muted">{t.ui.captureNote}</p>

        <Button onClick={reset}>{t.ui.reset}</Button>
      </div>

      <ToolContent route="keyboard-test" />
    </main>
  );
}
