import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Button } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import MouseDiagram from '../../components/MouseDiagram';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { analyseChatter, analysePolling, type ClickHealth } from '@core/input/diagnostics';

/**
 * Mouse tester — buttons, wheel, double-click health and polling rate.
 *
 * What separates this from the many "click and watch a box turn green" pages is
 * that it reaches a VERDICT. The gap between consecutive presses of the same
 * button is what exposes a worn switch: a healthy button emits one press, a
 * failing one emits two a few milliseconds apart, which feels like a random
 * double-click and is otherwise impossible to prove. Polling rate is measured
 * the same way, from real event timings.
 *
 * The report download exists because the usual reason someone tests a mouse is
 * to argue with a warranty desk, and "it double-clicks sometimes" is a much
 * weaker claim than a timestamped list of 6 ms press intervals.
 *
 * Everything is measured in the page and discarded; nothing is stored or sent.
 */

const BUTTONS = [0, 2, 1, 3, 4] as const; // left, right, middle, back, forward
const SCROLL_FLASH_MS = 300;
/** Enough movement samples for a stable median without a long wait. */
const POLL_SAMPLE_CAP = 400;

export default function MouseTest() {
  const { m, fmt } = useI18n();
  const t = m.tools['mouse-test'];
  const u = t.ui;
  useSeo('mouse-test');

  const [pressed, setPressed] = createSignal<Set<number>>(new Set<number>());
  const [seen, setSeen] = createSignal<Set<number>>(new Set<number>());
  const [counts, setCounts] = createSignal<Record<number, number>>({});
  const [gaps, setGaps] = createSignal<Record<number, number[]>>({});
  const [scroll, setScroll] = createSignal({ up: 0, down: 0, left: 0, right: 0 });
  const [scrollDir, setScrollDir] = createSignal<'up' | 'down' | 'left' | 'right' | null>(null);
  const [lastGap, setLastGap] = createSignal<number | null>(null);
  const [pos, setPos] = createSignal<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = createSignal(false);
  const [moveTimes, setMoveTimes] = createSignal<number[]>([]);

  // Per-button time of the previous press, for the gap measurement.
  const lastDown: Record<number, number> = {};
  let scrollTimer: number | undefined;

  const label = (b: number) =>
    b === 0 ? u.left : b === 2 ? u.right : b === 1 ? u.middle : b === 3 ? u.back : u.forward;

  const scrollTotal = createMemo(() => {
    const s = scroll();
    return s.up + s.down + s.left + s.right;
  });

  /** Worst verdict across all buttons — that is the one the user needs to see. */
  const health = createMemo(() => {
    const all = Object.values(gaps()).flat();
    return analyseChatter(all);
  });

  const polling = createMemo(() => analysePolling(moveTimes()));

  const healthLabel = (h: ClickHealth) =>
    h === 'ok' ? u.healthOk : h === 'suspect' ? u.healthSuspect : h === 'faulty' ? u.healthFaulty : u.healthUntested;

  function down(e: PointerEvent) {
    e.preventDefault();
    setPressed((p) => new Set<number>(p).add(e.button));
    setSeen((p) => new Set<number>(p).add(e.button));
    setCounts((c) => ({ ...c, [e.button]: (c[e.button] ?? 0) + 1 }));

    const prev = lastDown[e.button];
    if (prev !== undefined) {
      const gap = Math.round(e.timeStamp - prev);
      setLastGap(gap);
      setGaps((g) => ({ ...g, [e.button]: [...(g[e.button] ?? []), gap] }));
    }
    lastDown[e.button] = e.timeStamp;
    setDragging(true);
  }

  function up(e: PointerEvent) {
    setPressed((p) => {
      const n = new Set<number>(p);
      n.delete(e.button);
      return n;
    });
    setDragging(false);
  }

  function move(e: PointerEvent & { currentTarget: HTMLElement }) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) });
    setMoveTimes((ts) => (ts.length >= POLL_SAMPLE_CAP ? ts : [...ts, e.timeStamp]));
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 'up' : e.deltaY > 0 ? 'down' : e.deltaX < 0 ? 'left' : 'right';
    setScroll((s) => ({ ...s, [dir]: s[dir] + 1 }));
    setScrollDir(dir);
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => setScrollDir(null), SCROLL_FLASH_MS);
  }

  // The pad must swallow the context menu or the right button can never be
  // tested — the menu steals the event and the indicator never lights.
  const blockMenu = (e: Event) => e.preventDefault();
  onMount(() => {
    document.addEventListener('contextmenu', blockMenu);
    onCleanup(() => {
      document.removeEventListener('contextmenu', blockMenu);
      clearTimeout(scrollTimer);
    });
  });

  function reset() {
    setPressed(new Set<number>());
    setSeen(new Set<number>());
    setCounts({});
    setGaps({});
    setScroll({ up: 0, down: 0, left: 0, right: 0 });
    setLastGap(null);
    setPos(null);
    setMoveTimes([]);
    for (const k of Object.keys(lastDown)) delete lastDown[Number(k)];
  }

  function downloadReport() {
    const h = health();
    const p = polling();
    const lines = [
      'YappyKit mouse test report',
      `Generated: ${new Date().toISOString()}`,
      `User agent: ${navigator.userAgent}`,
      '',
      'BUTTONS',
      ...BUTTONS.map((b) => {
        const r = analyseChatter(gaps()[b] ?? []);
        return `  ${label(b)}: ${counts()[b] ?? 0} presses, ${healthLabel(r.health)}` +
          (r.shortestGapMs !== null ? `, shortest gap ${r.shortestGapMs} ms` : '');
      }),
      '',
      'SCROLL',
      `  up ${scroll().up} / down ${scroll().down} / left ${scroll().left} / right ${scroll().right}`,
      '',
      'DOUBLE-CLICK HEALTH',
      `  ${healthLabel(h.health)}: ${h.chatterEvents} impossible-fast, ${h.suspectEvents} suspect`,
      '',
      'POLLING RATE',
      `  ${p.hz === null ? 'not measured' : `${p.hz.toFixed(0)} Hz${p.nearest ? ` (~${p.nearest} Hz)` : ''}`} from ${p.samples} samples`,
      '',
      'Measured locally in the browser. No data was uploaded.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yappykit-mouse-test.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-6">
        <p class="text-sm text-muted">{u.instructions}</p>

        <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <MouseDiagram
            held={pressed()}
            tested={seen()}
            scrollDir={scrollDir()}
            label={u.diagramLabel}
          />

          <div
            onPointerDown={down}
            onPointerUp={up}
            onPointerMove={move}
            onWheel={wheel}
            class="relative flex h-60 w-full select-none items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface text-sm text-muted"
          >
            <span>{u.padLabel}</span>
            <Show when={pos()}>
              {(p) => (
                <span class="absolute bottom-3 end-3 text-xs">
                  {fmt(u.position, { x: p().x, y: p().y })}
                </span>
              )}
            </Show>
            <span class="absolute bottom-3 start-3 text-xs">
              {dragging() ? u.dragging : u.notDragging}
            </span>
          </div>
        </div>
        <p class="text-xs text-muted">{u.noContextHint}</p>

        {/* Verdict — the part other testers do not give you. */}
        <section
          class={`rounded-lg border p-4 ${
            health().health === 'faulty'
              ? 'border-danger bg-danger-soft'
              : health().health === 'suspect'
                ? 'border-border bg-surface'
                : 'border-border bg-surface'
          }`}
        >
          <h2 class="text-base font-semibold">{u.healthHeading}</h2>
          <p class="mt-1 text-sm font-medium text-fg" role="status">
            {healthLabel(health().health)}
          </p>
          <Show when={health().chatterEvents > 0}>
            <p class="mt-2 text-sm text-fg">
              {fmt(u.chatterDetail, { n: health().chatterEvents, ms: health().shortestGapMs ?? 0 })}
            </p>
          </Show>
          <Show when={health().chatterEvents === 0 && health().suspectEvents > 0}>
            <p class="mt-2 text-sm text-muted">
              {fmt(u.suspectDetail, { n: health().suspectEvents, ms: health().shortestGapMs ?? 0 })}
            </p>
          </Show>
          <Show when={lastGap() !== null}>
            <p class="mt-2 text-xs text-muted">{fmt(u.doubleClickResult, { ms: lastGap()! })}</p>
          </Show>
          <Show when={lastGap() === null}>
            <p class="mt-2 text-xs text-muted">{u.doubleClickPrompt}</p>
          </Show>
        </section>

        <section>
          <h2 class="text-base font-semibold">{u.buttonsHeading}</h2>
          <ul class="mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-5">
            <For each={BUTTONS}>
              {(b) => (
                <li
                  class={`rounded-lg border p-3 text-center text-sm transition-colors ${
                    pressed().has(b)
                      ? 'border-accent bg-accent text-accent-fg'
                      : seen().has(b)
                        ? 'border-success bg-surface text-fg'
                        : 'border-border bg-surface text-muted'
                  }`}
                >
                  <span class="block font-medium">{label(b)}</span>
                  <span class="mt-1 block text-xs">
                    {seen().has(b) ? fmt(u.clicks, { n: counts()[b] ?? 0 }) : u.untested}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section>
          <h2 class="text-base font-semibold">{u.scrollHeading}</h2>
          <ul class="mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
            <For
              each={[
                [u.scrollUp, scroll().up],
                [u.scrollDown, scroll().down],
                [u.scrollLeft, scroll().left],
                [u.scrollRight, scroll().right],
              ] as const}
            >
              {([name, n]) => (
                <li class="rounded-lg border border-border bg-surface p-3 text-center text-sm">
                  <span class="block font-medium text-fg">{name}</span>
                  <span class="mt-1 block text-xs text-muted">{n}</span>
                </li>
              )}
            </For>
          </ul>
          <p class="mt-2 text-xs text-muted">{fmt(u.scrollTotal, { n: scrollTotal() })}</p>
        </section>

        <section>
          <h2 class="text-base font-semibold">{u.pollingHeading}</h2>
          <p class="mt-1 text-xs text-muted">{u.pollingHint}</p>
          <p class="mt-2 text-sm text-fg" role="status">
            <Show
              when={polling().hz !== null}
              fallback={fmt(u.pollingMeasuring, { n: polling().samples })}
            >
              {polling().nearest
                ? fmt(u.pollingResult, {
                    hz: polling().hz!.toFixed(0),
                    nearest: polling().nearest!,
                  })
                : fmt(u.pollingRaw, { hz: polling().hz!.toFixed(0) })}
            </Show>
          </p>
          <p class="mt-1 text-xs text-muted">{u.pollingNote}</p>
        </section>

        <section class="rounded-lg border border-border bg-surface p-4">
          <h2 class="text-base font-semibold">{u.reportHeading}</h2>
          <p class="mt-1 text-xs text-muted">{u.reportHint}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button onClick={downloadReport}>{u.reportButton}</Button>
            <button
              type="button"
              onClick={reset}
              class="inline-flex items-center rounded border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
            >
              {u.reset}
            </button>
          </div>
        </section>
      </div>

      <ToolContent route="mouse-test" />
    </main>
  );
}
