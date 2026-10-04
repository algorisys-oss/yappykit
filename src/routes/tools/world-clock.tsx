import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Button, SegmentedControl } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import ToolContent from '../tool-content';
import { WorldClockPreview } from '../tool-previews';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities } from '@core/capability';
import {
  CITIES, deviceZone, describeZone, countryName, genericZoneName, searchZones, zoneKey,
  type ZoneMatch,
} from '@core/worldclock/zones';
import {
  wallTime, instantAt, shiftDays, dayShift, relativeOffset, formatRelativeOffset,
  offsetMinutes, hourBand, type HourBand,
} from '@core/worldclock/time';
import {
  MAX_CLOCKS, loadPrefs, savePrefs, addZone, removeZone, makeHome, encodeShare, decodeShare,
} from '@core/worldclock/list';

/**
 * A world clock that is also a meeting planner.
 *
 * Home is the first clock, and it starts as the zone the device reports: no
 * geolocation prompt, no IP lookup, nothing leaves the tab. Every other clock
 * is read against home, and every row carries a strip of its hours across the
 * home day, shaded by how reasonable each hour is to ask of someone there.
 *
 * One instant drives the page. It is "now" until the person drags the slider
 * or clicks an hour, and then it is the time they are planning, until they go
 * back to now. Rows never hold time of their own, so they cannot disagree.
 */

const STEP_MINUTES = 15;
const POPULAR_COUNT = 12;

const BAND_CLASS: Record<HourBand, string> = {
  work: 'bg-success-soft text-fg',
  edge: 'bg-warning-soft text-fg',
  night: 'bg-surface text-muted',
};

const BAND_DOT: Record<HourBand, string> = {
  work: 'bg-success',
  edge: 'bg-warning',
  night: 'bg-border',
};

export default function WorldClock() {
  const { m, fmt, locale } = useI18n();
  const t = m.tools['world-clock'];
  const u = t.ui;
  useSeo('world-clock');

  const device = deviceZone();
  const fullSearch = detectCapabilities().timeZoneList;

  const [zones, setZones] = createSignal<string[]>([device]);
  const [hour12, setHour12] = createSignal<boolean | null>(null);
  const [now, setNow] = createSignal(Date.now());
  const [planned, setPlanned] = createSignal<number | null>(null);
  const [notice, setNotice] = createSignal('');
  const [shareState, setShareState] = createSignal<'idle' | 'copied' | 'failed'>('idle');

  const home = () => zones()[0]!;
  const instant = () => planned() ?? now();

  const persist = (next: string[], h12 = hour12()) => {
    setZones(next);
    savePrefs(window.localStorage, { zones: next, hour12: h12 });
  };

  /**
   * A shared link adds its places to the visitor's own clocks rather than
   * replacing them: the visitor's home is still where they are. The fragment
   * is cleared afterwards so a reload does not add them a second time.
   */
  function applyShare(list: string[]): string[] {
    const shared = decodeShare(window.location.hash);
    if (!shared) return list;
    let next = list;
    for (const z of shared) next = addZone(next, z);
    setNotice(fmt(u.addedFromLink, { n: next.length - list.length }));
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return next;
  }

  onMount(() => {
    const prefs = loadPrefs(window.localStorage, device);
    setHour12(prefs.hour12);
    persist(applyShare(prefs.zones), prefs.hour12);

    // A link followed while already on this page changes only the fragment,
    // which is a same-document navigation: no reload, so no onMount.
    const onHash = () => persist(applyShare(zones()));
    window.addEventListener('hashchange', onHash);
    onCleanup(() => window.removeEventListener('hashchange', onHash));

    // The display is minutes, but ticking each second keeps the minute change
    // within a second of the real one, and a throttled background tab only
    // makes it late until the next wake, never wrong.
    const id = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(id));
  });

  // ── Formatting ──────────────────────────────────────────────────────────
  // Formatters are cached per zone. Every row redraws each second and its
  // strip labels 24 hours, so building them fresh is hundreds a second.
  const timeFormats = createMemo(() => {
    const h12 = hour12();
    const cache = new Map<string, Intl.DateTimeFormat>();
    return (zone: string) => {
      let f = cache.get(zone);
      if (!f) {
        f = new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          hour: 'numeric',
          minute: '2-digit',
          ...(h12 === null ? {} : { hour12: h12 }),
        });
        cache.set(zone, f);
      }
      return f;
    };
  });
  const dateFormats = new Map<string, Intl.DateTimeFormat>();
  const formatTime = (zone: string, at: number) => timeFormats()(zone).format(at);
  const formatDate = (zone: string, at: number) => {
    let f = dateFormats.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' });
      dateFormats.set(zone, f);
    }
    return f.format(at);
  };

  /** Whether this locale writes times on a 12-hour clock when not told otherwise. */
  const localeUses12 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === true;
  const uses12 = () => hour12() ?? localeUses12;

  const cellHour = (hour: number) => (uses12() ? String(hour % 12 || 12) : String(hour));

  // ── The home day the strips and the slider cover ────────────────────────
  const homeWall = () => wallTime(home(), instant());
  const homeHours = createMemo(() => {
    const day = homeWall();
    return Array.from({ length: 24 }, (_, hour) => instantAt(home(), { ...day, hour, minute: 0 }));
  });
  const sliderValue = () => {
    const w = homeWall();
    return Math.floor((w.hour * 60 + w.minute) / STEP_MINUTES) * STEP_MINUTES;
  };

  function planAt(minutes: number) {
    const day = homeWall();
    setPlanned(instantAt(home(), { ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }));
  }

  function planDay(days: number) {
    const target = shiftDays(homeWall(), days);
    setPlanned(instantAt(home(), target));
  }

  // ── Editing the list ────────────────────────────────────────────────────
  function add(zone: string) {
    const key = zoneKey(zone);
    if (zones().includes(key)) {
      setNotice(fmt(u.alreadyAdded, { city: describeZone(key).city }));
      return;
    }
    if (zones().length >= MAX_CLOCKS) {
      setNotice(fmt(u.limitReached, { max: MAX_CLOCKS }));
      return;
    }
    persist(addZone(zones(), key));
    setNotice('');
    setShareState('idle');
  }

  function remove(zone: string) {
    persist(removeZone(zones(), zone));
    setShareState('idle');
  }

  function rehome(zone: string) {
    persist(makeHome(zones(), zone));
    setShareState('idle');
  }

  function setFormat(value: '12' | '24') {
    const h12 = value === '12';
    setHour12(h12);
    savePrefs(window.localStorage, { zones: zones(), hour12: h12 });
  }

  // ── Search ──────────────────────────────────────────────────────────────
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);

  const results = createMemo<ZoneMatch[]>(() => {
    const q = query().trim();
    if (q) return searchZones(q, locale);
    return CITIES.filter((c) => !zones().includes(zoneKey(c.zone)))
      .slice(0, POPULAR_COUNT)
      .map((c) => ({ zone: zoneKey(c.zone), city: c.city, country: countryName(c.country, locale), curated: true }));
  });

  function pick(match: ZoneMatch | undefined) {
    if (!match) return;
    add(match.zone);
    setQuery('');
    setActive(0);
  }

  function onSearchKey(e: KeyboardEvent) {
    const list = results();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(list[active()]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // ── Share ───────────────────────────────────────────────────────────────
  const shareUrl = () => `${window.location.origin}${window.location.pathname}${encodeShare(zones())}`;

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setShareState('copied');
    } catch {
      setShareState('failed');
    }
  }

  // ── Rows ────────────────────────────────────────────────────────────────
  // The generic name ("Pacific Time") does not change with daylight saving, so
  // it is worked out once per zone rather than on every tick.
  const lines = new Map<string, string>();
  const describeLine = (zone: string) => {
    let line = lines.get(zone);
    if (line === undefined) {
      const c = describeZone(zone);
      line = [countryName(c.country, locale), genericZoneName(zone, locale)].filter(Boolean).join(' · ');
      lines.set(zone, line);
    }
    return line;
  };

  const offsetLine = (zone: string, index: number) => {
    if (index === 0) return '';
    const diff = relativeOffset(zone, home(), instant());
    return diff === 0 ? u.sameAsHome : fmt(u.offsetFromHome, { offset: formatRelativeOffset(diff) });
  };

  const dayLine = (zone: string) => {
    const shift = dayShift(zone, home(), instant());
    return shift > 0 ? u.tomorrow : shift < 0 ? u.yesterday : '';
  };

  const bandLabel = (band: HourBand) => (band === 'work' ? u.bandWork : band === 'edge' ? u.bandEdge : u.bandNight);

  /** The minute past the hour that this zone's hours fall on against home's, if not :00. */
  const offHour = (zone: string) => {
    const diff = ((offsetMinutes(zone, instant()) - offsetMinutes(home(), instant())) % 60 + 60) % 60;
    return diff ? String(diff).padStart(2, '0') : '';
  };

  const selectedHour = () => homeWall().hour;

  return (
    <main class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <ToolHero title={t.heroTitle} tool="world-clock" preview={WorldClockPreview}>
        {t.heroNote}
      </ToolHero>

      <div class="mt-8 space-y-8">
        {/* The instant every clock shows, and the controls that move it. */}
        <section class="rounded-lg border border-border bg-surface p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="m-0 text-sm font-semibold text-fg" role="status">
              {planned() === null ? u.nowLabel : u.plannedLabel}
            </p>
            <SegmentedControl
              aria-label={u.hourFormatLabel}
              options={[
                { value: '12', label: u.hour12 },
                { value: '24', label: u.hour24 },
              ]}
              value={uses12() ? '12' : '24'}
              onChange={setFormat}
            />
          </div>

          <label class="mt-4 block text-sm font-medium text-fg" for="wc-slider">
            {fmt(u.sliderLabel, { city: describeZone(home()).city })}
          </label>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span class="text-2xl font-bold tabular-nums text-fg">{formatTime(home(), instant())}</span>
            <span class="text-sm text-muted">{formatDate(home(), instant())}</span>
          </div>
          <input
            id="wc-slider"
            type="range"
            class="mt-2 w-full cursor-pointer"
            min="0"
            max={24 * 60 - STEP_MINUTES}
            step={STEP_MINUTES}
            value={sliderValue()}
            aria-valuetext={`${formatTime(home(), instant())}, ${formatDate(home(), instant())}`}
            onInput={(e) => planAt(Number(e.currentTarget.value))}
          />
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => planDay(-1)}>{u.previousDay}</Button>
            <Button onClick={() => planDay(1)}>{u.nextDay}</Button>
            <Show when={planned() !== null}>
              <button
                type="button"
                onClick={() => setPlanned(null)}
                class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
              >
                {u.backToNow}
              </button>
            </Show>
          </div>
        </section>

        {/* The clocks */}
        <section>
          <p class="m-0 text-sm text-muted">{u.legend}</p>
          <div class="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            <For each={['work', 'edge', 'night'] as HourBand[]}>
              {(band) => (
                <span class="flex items-center gap-1.5">
                  <span class={`inline-block h-2.5 w-2.5 rounded-full ${BAND_DOT[band]}`} aria-hidden="true" />
                  {bandLabel(band)}
                </span>
              )}
            </For>
          </div>

          <ul class="m-0 mt-4 list-none space-y-3 p-0">
            <For each={zones()}>
              {(zone, index) => {
                const city = () => describeZone(zone).city;
                const band = () => hourBand(wallTime(zone, instant()).hour);
                return (
                  <li class="rounded-lg border border-border bg-bg p-4" data-zone={zone}>
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="m-0 flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
                          {city()}
                          <Show when={index() === 0}>
                            <span class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-fg">
                              {u.homeBadge}
                            </span>
                          </Show>
                        </p>
                        <p class="m-0 mt-0.5 text-xs text-muted">{describeLine(zone)}</p>
                      </div>
                      <div class="w-full sm:w-auto sm:text-end">
                        <p class="m-0 text-3xl font-bold leading-none tabular-nums text-fg" data-clock>
                          {formatTime(zone, instant())}
                        </p>
                        <p class="m-0 mt-1 text-xs text-muted">
                          {[formatDate(zone, instant()), dayLine(zone), offsetLine(zone, index())]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div
                      class="mt-3 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-px overflow-hidden rounded"
                      role="group"
                      aria-label={fmt(u.stripLabel, { city: city() })}
                    >
                      <For each={homeHours()}>
                        {(at, h) => {
                          const local = () => wallTime(zone, at);
                          const selected = () => h() === selectedHour();
                          return (
                            <button
                              type="button"
                              onClick={() => planAt(h() * 60)}
                              aria-label={fmt(u.cellLabel, { time: formatTime(zone, at), city: city() })}
                              aria-pressed={selected()}
                              class={`m-0 min-w-0 cursor-pointer appearance-none border-0 px-0 py-1.5 text-center text-[0.625rem] tabular-nums leading-none sm:text-xs ${
                                BAND_CLASS[hourBand(local().hour)]
                              } ${selected() ? 'font-bold shadow-[inset_0_0_0_2px_var(--zen-color-primary)]' : ''}`}
                            >
                              {cellHour(local().hour)}
                            </button>
                          );
                        }}
                      </For>
                    </div>

                    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span class="flex items-center gap-1.5">
                        <span class={`inline-block h-2 w-2 rounded-full ${BAND_DOT[band()]}`} aria-hidden="true" />
                        {bandLabel(band())}
                        <Show when={offHour(zone)}>
                          {(minute) => <span>· {fmt(u.offHourNote, { minute: minute() })}</span>}
                        </Show>
                      </span>
                      <Show when={index() > 0}>
                        <span class="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => rehome(zone)}
                            class="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted underline hover:text-accent"
                          >
                            {u.makeHome}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(zone)}
                            aria-label={fmt(u.removeLabel, { city: city() })}
                            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-base text-muted hover:bg-danger-soft hover:text-danger"
                          >
                            ✕
                          </button>
                        </span>
                      </Show>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
          <p class="mt-3 text-xs text-muted">{fmt(u.deviceHomeNote, { zone: device })}</p>
        </section>

        {/* Add a clock */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.addHeading}</h2>
          <label class="mt-3 block text-sm font-medium text-fg" for="wc-search">{u.searchLabel}</label>
          <div class="relative mt-1 max-w-lg">
            <input
              id="wc-search"
              type="text"
              role="combobox"
              autocomplete="off"
              aria-autocomplete="list"
              aria-expanded={open() && results().length > 0}
              aria-controls="wc-results"
              aria-activedescendant={open() && results()[active()] ? `wc-opt-${active()}` : undefined}
              class="box-border w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
              placeholder={u.searchPlaceholder}
              value={query()}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                setActive(0);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onSearchKey}
            />
            <Show when={open()}>
              <div class="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded border border-border bg-bg shadow-lg">
                <Show when={!query().trim()}>
                  <p class="m-0 px-3 pb-1 pt-2 text-xs font-semibold text-muted">{u.popularHeading}</p>
                </Show>
                <Show
                  when={results().length > 0}
                  fallback={<p class="m-0 px-3 py-2 text-sm text-muted">{u.noMatches}</p>}
                >
                  <ul id="wc-results" role="listbox" class="m-0 list-none p-0">
                    <For each={results()}>
                      {(match, i) => (
                        <li
                          id={`wc-opt-${i()}`}
                          role="option"
                          aria-selected={i() === active()}
                          // mousedown, not click: the input's blur closes the list
                          // before a click would land.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pick(match);
                          }}
                          onMouseEnter={() => setActive(i())}
                          class={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm ${
                            i() === active() ? 'bg-accent-soft' : ''
                          }`}
                        >
                          <span class="min-w-0 text-fg">
                            {match.city}
                            <Show when={match.country}>
                              <span class="text-muted">, {match.country}</span>
                            </Show>
                          </span>
                          <span class="shrink-0 tabular-nums text-muted">{formatTime(match.zone, instant())}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </Show>
          </div>
          <Show when={notice()}>
            <p class="mt-2 text-sm text-fg" role="status">{notice()}</p>
          </Show>
          <Show when={!fullSearch}>
            <p class="mt-2 max-w-prose text-xs text-muted">{u.curatedOnly}</p>
          </Show>
        </section>

        {/* Share */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.shareHeading}</h2>
          <p class="mt-2 max-w-prose text-sm text-muted">{u.shareHint}</p>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void copyShare()}>{u.copyLink}</Button>
            <Show when={shareState() === 'copied'}>
              <span class="text-sm text-success" role="status">{u.linkCopied}</span>
            </Show>
          </div>
          <Show when={shareState() === 'failed'}>
            <p class="mt-2 text-sm text-fg" role="status">{u.linkCopyFailed}</p>
            <input
              type="text"
              readOnly
              aria-label={u.copyLink}
              class="mt-1 box-border w-full max-w-lg rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
              value={shareUrl()}
              onFocus={(e) => e.currentTarget.select()}
            />
          </Show>
        </section>
      </div>

      <ToolContent route="world-clock" />
    </main>
  );
}
