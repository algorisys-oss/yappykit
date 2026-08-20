import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import {
  CARD_WIDTH_MM, CARD_HEIGHT_MM, DEFAULT_PPI, MIN_PPI, MAX_PPI,
  ppiFromCardWidth, cardWidthForPpi, mmToPx, isPlausiblePpi,
  ticks, readout, loadPpi, savePpi, clearPpi, type Unit,
} from '@core/ruler/calibrate';

/**
 * Actual-size on-screen ruler.
 *
 * Two things make it genuinely usable rather than decorative:
 *
 * 1. CALIBRATION. CSS pins an inch to 96 px regardless of the hardware, so an
 *    uncalibrated screen ruler is a guess. The user matches an outline to a bank
 *    card (ISO/IEC 7810 ID-1, 85.60 mm worldwide) and every reading derives from
 *    the resulting pixel density. Maths and persistence live in @core/ruler.
 *
 * 2. IT MOVES. A ruler fixed in the page flow cannot be laid against anything.
 *    The bar is dragged by its grip to any position on the measuring surface,
 *    rotates to vertical, and goes full screen — so you can hold a physical
 *    object against the display and line the zero edge up with it, which is the
 *    actual reason to want a screen ruler.
 */
type Orientation = 'horizontal' | 'vertical';

export default function Ruler() {
  const { m, fmt } = useI18n();
  const t = m.tools.ruler;
  useSeo('ruler');

  const [ppi, setPpi] = createSignal(DEFAULT_PPI);
  const [calibrated, setCalibrated] = createSignal(false);
  const [editing, setEditing] = createSignal(true);
  const [saved, setSaved] = createSignal(false);
  const [unit, setUnit] = createSignal<Unit>('cm');
  const [orient, setOrient] = createSignal<Orientation>('horizontal');
  const [marker, setMarker] = createSignal<number | null>(null);
  const [surface, setSurface] = createSignal({ w: 0, h: 0 });
  const [offset, setOffset] = createSignal({ x: 16, y: 16 });
  const [full, setFull] = createSignal(false);

  let surfaceEl: HTMLDivElement | undefined;
  let dragFrom: { px: number; py: number; ox: number; oy: number } | null = null;

  const vertical = () => orient() === 'vertical';

  /** How long the ruler can be: the surface's extent along its own axis. */
  const span = createMemo(() => {
    const s = surface();
    const along = vertical() ? s.h : s.w;
    const start = vertical() ? offset().y : offset().x;
    return Math.max(0, along - start - 8);
  });

  const marks = createMemo(() => ticks(span(), ppi(), unit()));
  const cardPx = createMemo(() => cardWidthForPpi(ppi()));

  const lengthLabel = createMemo(() =>
    fmt(t.ui.lengthReadout, {
      cm: readout(span(), ppi(), 'cm'),
      inch: readout(span(), ppi(), 'inch'),
    }),
  );

  onMount(() => {
    const stored = loadPpi(window.localStorage);
    if (stored !== null) {
      setPpi(stored);
      setCalibrated(true);
      setEditing(false);
    }
    const measure = () => {
      if (surfaceEl) setSurface({ w: surfaceEl.clientWidth, h: surfaceEl.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    const onFsChange = () => {
      setFull(!!document.fullscreenElement);
      // The surface changes size on the frame AFTER the event, so re-measure late.
      requestAnimationFrame(measure);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    onCleanup(() => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', onFsChange);
    });
  });

  function onCardResize(e: Event & { currentTarget: HTMLInputElement }) {
    const next = ppiFromCardWidth(Number(e.currentTarget.value));
    if (isPlausiblePpi(next)) {
      setPpi(next);
      setSaved(false);
    }
  }

  function save() {
    savePpi(window.localStorage, ppi());
    setCalibrated(true);
    setEditing(false);
    setSaved(true);
  }

  function reset() {
    clearPpi(window.localStorage);
    setPpi(DEFAULT_PPI);
    setCalibrated(false);
    setEditing(true);
    setSaved(false);
  }

  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (surfaceEl) await surfaceEl.requestFullscreen();
  }

  /* --- dragging the whole ruler by its grip --- */
  function gripDown(e: PointerEvent & { currentTarget: HTMLElement }) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom = { px: e.clientX, py: e.clientY, ox: offset().x, oy: offset().y };
  }
  function gripMove(e: PointerEvent) {
    if (!dragFrom) return;
    e.preventDefault();
    const s = surface();
    setOffset({
      x: Math.max(0, Math.min(s.w - 40, dragFrom.ox + (e.clientX - dragFrom.px))),
      y: Math.max(0, Math.min(s.h - 40, dragFrom.oy + (e.clientY - dragFrom.py))),
    });
  }
  const gripUp = () => void (dragFrom = null);

  /* --- placing the reading marker along the scale --- */
  function place(e: PointerEvent & { currentTarget: HTMLElement }) {
    const r = e.currentTarget.getBoundingClientRect();
    const along = vertical() ? e.clientY - r.top : e.clientX - r.left;
    setMarker(Math.max(0, Math.min(span(), along)));
  }

  const RULER_THICKNESS = 92;

  return (
    <main class="mx-auto max-w-4xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-8">
        {/* Calibration */}
        <section class="rounded-lg border border-border bg-surface p-5">
          <h2 class="text-base font-semibold text-fg">{t.ui.calibrateHeading}</h2>
          <Show
            when={editing()}
            fallback={
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <p class="text-sm text-success">{fmt(t.ui.calibrated, { ppi: ppi().toFixed(1) })}</p>
                <Button onClick={() => setEditing(true)}>{t.ui.recalibrate}</Button>
              </div>
            }
          >
            <p class="mt-2 max-w-prose text-sm text-muted">{t.ui.calibrateIntro}</p>
            <div class="mt-5 overflow-x-auto">
              <div
                class="relative select-none rounded-lg border-2 border-accent bg-bg"
                style={{ width: `${cardPx()}px`, height: `${mmToPx(CARD_HEIGHT_MM, ppi())}px` }}
              >
                <span class="absolute bottom-1 right-2 text-[10px] text-muted">
                  {CARD_WIDTH_MM} × {CARD_HEIGHT_MM} mm
                </span>
              </div>
            </div>
            <label class="mt-5 block text-sm font-medium text-fg" for="card-width">
              {t.ui.widthLabel}
            </label>
            <input
              id="card-width"
              type="range"
              class="mt-2 w-full max-w-lg cursor-pointer"
              min={cardWidthForPpi(MIN_PPI)}
              max={cardWidthForPpi(MAX_PPI)}
              step="0.5"
              value={cardPx()}
              onInput={onCardResize}
            />
            <p class="mt-1 text-xs text-muted">{t.ui.cardHint}</p>
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={save}>{t.ui.saveCalibration}</Button>
              <Show when={calibrated()}>
                <button
                  type="button"
                  onClick={reset}
                  class="cursor-pointer border-0 bg-transparent p-0 text-sm text-muted underline hover:text-accent"
                >
                  {t.ui.reset}
                </button>
              </Show>
              <Show when={saved()}>
                <span class="text-sm text-success" role="status">{t.ui.saved}</span>
              </Show>
            </div>
          </Show>
          <Show when={!calibrated()}>
            <p class="mt-3 text-xs text-muted">{t.ui.uncalibrated}</p>
          </Show>
        </section>

        {/* Controls */}
        <div class="flex flex-wrap items-end gap-6">
          <div>
            <p class="mb-2 text-sm font-medium">{t.ui.unitsLabel}</p>
            <SegmentedControl
              aria-label={t.ui.unitsLabel}
              options={[
                { value: 'cm' as Unit, label: t.ui.unitCm },
                { value: 'inch' as Unit, label: t.ui.unitInch },
              ]}
              value={unit()}
              onChange={setUnit}
            />
          </div>
          <div>
            <p class="mb-2 text-sm font-medium">{t.ui.orientationLabel}</p>
            <SegmentedControl
              aria-label={t.ui.orientationLabel}
              options={[
                { value: 'horizontal' as Orientation, label: t.ui.horizontal },
                { value: 'vertical' as Orientation, label: t.ui.vertical },
              ]}
              value={orient()}
              onChange={setOrient}
            />
          </div>
          <Button onClick={() => void toggleFull()}>
            {full() ? t.ui.exitFullscreen : t.ui.fullscreen}
          </Button>
        </div>

        {/* Measuring surface. In full screen this element IS the screen, so the
            ruler can be laid against a physical object held to the display. */}
        <section>
          <div
            ref={(el) => (surfaceEl = el)}
            class={`relative select-none overflow-hidden border border-border bg-surface ${
              full() ? 'h-screen w-screen rounded-none' : 'h-[26rem] w-full rounded-lg'
            }`}
          >
            <div
              class="absolute"
              style={
                vertical()
                  ? { left: `${offset().x}px`, top: `${offset().y}px`, width: `${RULER_THICKNESS}px`, height: `${span()}px` }
                  : { left: `${offset().x}px`, top: `${offset().y}px`, width: `${span()}px`, height: `${RULER_THICKNESS}px` }
              }
            >
              {/* Grip — drag this to move the whole ruler. */}
              <div
                onPointerDown={gripDown}
                onPointerMove={gripMove}
                onPointerUp={gripUp}
                onPointerCancel={gripUp}
                class={`absolute z-10 flex cursor-move touch-none select-none items-center justify-center bg-accent text-[10px] font-semibold text-accent-fg ${
                  vertical() ? 'left-0 top-0 h-full w-5' : 'left-0 top-0 h-5 w-full'
                }`}
              >
                <span aria-hidden="true">⠿</span>
              </div>

              {/* Scale */}
              <div
                onPointerDown={place}
                onPointerMove={(e) => e.buttons === 1 && place(e)}
                class={`absolute touch-none select-none border border-border bg-bg ${
                  vertical() ? 'bottom-0 left-5 right-0 top-0' : 'bottom-0 left-0 right-0 top-5'
                }`}
                role="img"
                aria-label={lengthLabel()}
              >
                <For each={marks()}>
                  {(mark) => (
                    <div
                      class="absolute bg-fg"
                      style={
                        vertical()
                          ? { top: `${mark.px}px`, left: '0', height: '1px', width: `${mark.weight * 40}px` }
                          : { left: `${mark.px}px`, top: '0', width: '1px', height: `${mark.weight * 40}px` }
                      }
                    />
                  )}
                </For>
                <For each={marks().filter((mk) => mk.label !== undefined)}>
                  {(mark) => (
                    <span
                      class="absolute text-xs font-medium text-fg"
                      style={
                        vertical()
                          ? { top: `${mark.px + 2}px`, left: '44px' }
                          : { left: `${mark.px + 3}px`, top: '44px' }
                      }
                    >
                      {mark.label}
                    </span>
                  )}
                </For>
                <Show when={marker() !== null}>
                  <div
                    class="absolute bg-accent"
                    style={
                      vertical()
                        ? { top: `${marker()!}px`, left: '0', right: '0', height: '2px' }
                        : { left: `${marker()!}px`, top: '0', bottom: '0', width: '2px' }
                    }
                  />
                </Show>
              </div>
            </div>
          </div>

          <p class="mt-2 text-xs text-muted">{t.ui.dragHint}</p>
          <p class="mt-1 text-sm text-muted">{lengthLabel()}</p>
          <Show when={marker() !== null}>
            <p class="mt-1 text-sm font-medium text-fg" role="status">
              {fmt(t.ui.markerReadout, {
                value: readout(marker()!, ppi(), unit()),
                unit: unit() === 'cm' ? 'cm' : 'in',
              })}
            </p>
          </Show>
          <p class="mt-1 text-xs text-muted">{t.ui.printHint}</p>
        </section>
      </div>

      <ToolContent route="ruler" />
    </main>
  );
}
