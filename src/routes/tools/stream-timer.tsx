import { createSignal, createMemo, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { useLocation } from '@solidjs/router';
import { Button, Switch } from '../../lib/zen';
import ToolHero from '../../components/ToolHero';
import Confetti from '../../components/Confetti';
import ToolContent from '../tool-content';
import { useSeo } from '../../lib/seo';
import { useI18n } from '../../i18n/runtime';
import { detectCapabilities } from '@core/capability';
import {
  createCountdown, start, pause, resume, reset, adjust, setDuration,
  remainingAt, tick, formatRemaining, MAX_DURATION_MS, type Countdown,
} from '@core/timer/countdown';
import {
  DEFAULT_SETTINGS, MIN_FONT_SCALE, MAX_FONT_SCALE,
  loadSettings, saveSettings, normalizeSettings, type TimerSettings,
} from '@core/timer/settings';
import { openTimerChannel, type TimerChannel } from '@core/timer/channel';
import { createBell, listAudioOutputs, type AudioOutput } from '@core/timer/bell';

/**
 * A countdown built for a livestream rather than for a kitchen.
 *
 * The tool is TWO SURFACES in one route. The control page is an ordinary tool
 * page: header, article, the controls the streamer touches. The display is the
 * same route with `?display=1`, opened in its own window, carrying nothing but
 * the clock and the message so it can be window-captured (or parked on a second
 * monitor) without the controls appearing on the broadcast. They are kept in
 * step over BroadcastChannel; the control page owns the state and the display
 * is a pure render of what it is sent.
 *
 * The clock in the display window ticks from the same absolute `endsAt`, not
 * from messages, so it stays correct between updates and cannot drift away from
 * the control page.
 */

const MINUTE = 60_000;
const PRESET_MINUTES = [1, 5, 10, 15, 30];
const KEY_COLOURS = ['#00b140', '#0047bb', '#000000'];

/**
 * Confetti colours, deliberately nowhere near the key colours above: a green
 * piece thrown over a green screen is a piece the chroma key eats, and the
 * celebration would be half missing in exactly the setup this tool is for.
 */
const CONFETTI_PALETTE = ['#f59e0b', '#ec4899', '#8b5cf6', '#22d3ee', '#fbbf24', '#f43f5e'];

/**
 * The clock and message, drawn identically in the display window and in the
 * control page's preview, so what the streamer approves is what goes out.
 *
 * Sizes are in `em` and the two callers set the root size: the display scales
 * off the viewport, the preview off a fixed size. One set of proportions, two
 * contexts.
 */
function TimerFace(props: { settings: TimerSettings; remainingMs: number; elapsed: boolean }) {
  return (
    <div
      class="relative flex h-full w-full flex-col items-center justify-center gap-[0.35em] overflow-hidden text-center"
      style={{ background: props.settings.background, color: props.settings.textColor }}
    >
      <Show when={props.settings.headline}>
        <p class="m-0 max-w-[92%] break-words text-[1em] font-semibold leading-tight">
          {props.settings.headline}
        </p>
      </Show>
      <p
        class={`m-0 text-[3em] font-bold leading-none tabular-nums ${props.elapsed ? 'animate-pulse' : ''}`}
      >
        {formatRemaining(props.remainingMs)}
      </p>
      <Show when={props.settings.subline}>
        <p class="m-0 max-w-[92%] break-words text-[0.62em] leading-snug opacity-80">
          {props.settings.subline}
        </p>
      </Show>
      <Confetti active={props.elapsed && props.settings.confettiEnabled} palette={CONFETTI_PALETTE} />
    </div>
  );
}

/** The capture surface: this window shows nothing else. */
function DisplaySurface() {
  const [settings, setSettings] = createSignal<TimerSettings>(DEFAULT_SETTINGS);
  const [countdown, setCountdown] = createSignal<Countdown>(createCountdown(DEFAULT_SETTINGS.durationMs));
  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    const channel = openTimerChannel();
    channel.onMessage((message) => {
      if (message.type !== 'state') return;
      setSettings(message.settings);
      setCountdown(message.countdown);
    });
    // The control page has been running for a while by the time this window
    // opens, so ask for the current state rather than waiting for a change.
    channel.post({ type: 'hello' });

    const id = setInterval(() => setNow(Date.now()), 200);
    // pagehide rather than unload: unload does not fire reliably when a window
    // is closed from the OS chrome, and the control page needs to know.
    const farewell = () => channel.post({ type: 'closing' });
    window.addEventListener('pagehide', farewell);

    onCleanup(() => {
      clearInterval(id);
      window.removeEventListener('pagehide', farewell);
      farewell();
      channel.close();
    });
  });

  const remaining = () => remainingAt(countdown(), now());

  return (
    <div
      class="fixed inset-0 z-50"
      style={{
        'font-size': `calc(min(7vw, 11vh) * ${settings().fontScale})`,
        background: settings().background,
      }}
    >
      <TimerFace settings={settings()} remainingMs={remaining()} elapsed={countdown().phase === 'elapsed'} />
    </div>
  );
}

function ControlPanel() {
  const { m, fmt } = useI18n();
  const t = m.tools['stream-timer'];
  const u = t.ui;
  useSeo('stream-timer');

  const [settings, setSettings] = createSignal<TimerSettings>(DEFAULT_SETTINGS);
  const [countdown, setCountdown] = createSignal<Countdown>(createCountdown(DEFAULT_SETTINGS.durationMs));
  const [now, setNow] = createSignal(Date.now());
  const [displayOpen, setDisplayOpen] = createSignal(false);
  const [outputs, setOutputs] = createSignal<AudioOutput[]>([]);
  const [audioBlocked, setAudioBlocked] = createSignal(false);

  const bell = createBell();
  let channel: TimerChannel | null = null;
  let displayWindow: Window | null = null;
  let wakeLock: { release(): Promise<void> } | null = null;

  const canPickOutput = detectCapabilities().audioOutputSelection;
  const remaining = () => remainingAt(countdown(), now());
  const phase = () => countdown().phase;
  const running = () => phase() === 'running';
  const patch = (next: Partial<TimerSettings>) => setSettings((s) => normalizeSettings({ ...s, ...next }));

  onMount(() => {
    const stored = loadSettings(window.localStorage);
    setSettings(stored);
    setCountdown(createCountdown(stored.durationMs));

    channel = openTimerChannel();
    channel.onMessage((message) => {
      if (message.type === 'hello') {
        setDisplayOpen(true);
        publish();
      }
      if (message.type === 'closing') setDisplayOpen(false);
    });

    const id = setInterval(() => {
      setNow(Date.now());
      setCountdown((c) => tick(c, Date.now()));
    }, 200);

    // A screen wake lock is dropped whenever the page is hidden, so it has to be
    // taken again on the way back rather than assumed to still be held.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && running()) void takeWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);

    onCleanup(() => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      void releaseWakeLock();
      bell.close();
      channel?.close();
      displayWindow?.close();
    });
  });

  function publish() {
    channel?.post({ type: 'state', countdown: countdown(), settings: settings() });
  }

  createEffect(publish);
  createEffect(() => saveSettings(window.localStorage, settings()));

  /**
   * Keep the scheduled strike in step with the clock.
   *
   * The bell is scheduled AHEAD on the audio clock the moment the timer starts,
   * so it rings on time even when this tab is throttled in the background. Any
   * change to the countdown invalidates that schedule, so it is torn down and
   * laid again rather than adjusted.
   */
  const bellEnabled = createMemo(() => settings().bellEnabled);
  const bellVolume = createMemo(() => settings().bellVolume);
  createEffect(() => {
    const c = countdown();
    const enabled = bellEnabled();
    const volume = bellVolume();
    bell.cancel();
    if (c.phase === 'running' && enabled) bell.ringIn(remainingAt(c, Date.now()), volume);
  });

  createEffect(() => {
    if (running()) void takeWakeLock();
    else void releaseWakeLock();
  });

  async function takeWakeLock() {
    const api = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!api || wakeLock) return;
    try {
      wakeLock = await api.request('screen');
    } catch {
      /* Denied or unsupported. The timer is still correct; the screen may sleep. */
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLock?.release();
    } catch {
      /* Already gone. */
    }
    wakeLock = null;
  }

  /**
   * Audio has to be unlocked inside the click itself. A context created outside
   * a user gesture starts suspended and every later strike is silently dropped,
   * which is the classic way a browser timer ends up never making a sound.
   */
  async function unlockAudio() {
    const ready = await bell.unlock();
    setAudioBlocked(!ready);
    if (ready && settings().sinkId) await bell.setSink(settings().sinkId);
    return ready;
  }

  async function onStart() {
    await unlockAudio();
    setCountdown((c) => start(c, Date.now()));
  }

  async function onResume() {
    await unlockAudio();
    setCountdown((c) => resume(c, Date.now()));
  }

  function onPause() {
    setCountdown((c) => pause(c, Date.now()));
  }

  function onReset() {
    setCountdown((c) => setDuration(reset(c), settings().durationMs));
  }

  async function onAdjust(deltaMs: number) {
    // Adding time to a finished timer starts it running again, which needs the
    // same audio permission a fresh start does.
    if (deltaMs > 0 && phase() === 'elapsed') await unlockAudio();
    setCountdown((c) => adjust(c, deltaMs, Date.now()));
  }

  async function onTestBell() {
    if (await unlockAudio()) bell.ringNow(settings().bellVolume);
  }

  function onDurationChange(minutes: number, seconds: number) {
    const ms = Math.min(MAX_DURATION_MS, minutes * MINUTE + seconds * 1000);
    patch({ durationMs: ms });
    setCountdown((c) => setDuration(c, ms));
  }

  function openDisplay() {
    // A named window means pressing this again focuses the display that is
    // already open instead of scattering copies across the desktop.
    displayWindow = window.open(
      `${window.location.pathname}?display=1`,
      'yappykit-stream-timer-display',
      'width=960,height=540',
    );
    displayWindow?.focus();
  }

  async function loadOutputs() {
    setOutputs(await listAudioOutputs());
  }

  async function onSinkChange(deviceId: string) {
    patch({ sinkId: deviceId });
    await bell.setSink(deviceId);
  }

  const statusLabel = () => {
    const p = phase();
    if (p === 'running') return u.statusRunning;
    if (p === 'paused') return u.statusPaused;
    if (p === 'elapsed') return u.statusElapsed;
    return u.statusIdle;
  };

  const durationMinutes = () => Math.floor(settings().durationMs / MINUTE);
  const durationSeconds = () => Math.round((settings().durationMs % MINUTE) / 1000);

  return (
    <main class="mx-auto max-w-4xl px-6 py-12">
      <ToolHero title={t.heroTitle}>{t.heroNote}</ToolHero>

      <div class="mt-8 space-y-8">
        {/* What goes on stream, and the transport that drives it. */}
        <section class="rounded-lg border border-border bg-surface p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <h2 class="text-base font-semibold text-fg">{u.previewHeading}</h2>
            <p class="text-sm text-muted" role="status">{statusLabel()}</p>
          </div>

          <div
            class="mt-4 aspect-video w-full overflow-hidden rounded-lg border border-border"
            style={{ 'font-size': `calc(1.6rem * ${settings().fontScale})` }}
          >
            <TimerFace settings={settings()} remainingMs={remaining()} elapsed={phase() === 'elapsed'} />
          </div>

          <div class="mt-5 flex flex-wrap items-center gap-3">
            <Show when={!running()} fallback={<Button onClick={onPause}>{u.pauseLabel}</Button>}>
              <Button onClick={() => void (phase() === 'paused' ? onResume() : onStart())}>
                {phase() === 'paused' ? u.resumeLabel : u.startLabel}
              </Button>
            </Show>
            <Button onClick={() => void onAdjust(MINUTE)}>{u.addMinute}</Button>
            <Button onClick={() => void onAdjust(-MINUTE)}>{u.subtractMinute}</Button>
            <button
              type="button"
              onClick={onReset}
              class="cursor-pointer border-0 bg-transparent p-0 text-sm text-muted underline hover:text-accent"
            >
              {u.resetLabel}
            </button>
          </div>
        </section>

        {/* The display window */}
        <section class="rounded-lg border border-border bg-surface p-5">
          <h2 class="text-base font-semibold text-fg">{u.displayHeading}</h2>
          <p class="mt-2 max-w-prose text-sm text-muted">{u.displayHint}</p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={openDisplay}>{displayOpen() ? u.reopenDisplay : u.openDisplay}</Button>
            <span class={`text-sm ${displayOpen() ? 'text-success' : 'text-muted'}`} role="status">
              {displayOpen() ? u.displayConnected : u.displayNotConnected}
            </span>
          </div>
          <p class="mt-3 max-w-prose text-xs text-muted">{u.obsNote}</p>
        </section>

        {/* Length */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.timeHeading}</h2>
          <div class="mt-3 flex flex-wrap gap-2">
            <For each={PRESET_MINUTES}>
              {(mins) => (
                <Button onClick={() => onDurationChange(mins, 0)} disabled={running()}>
                  {fmt(u.presetMinutes, { minutes: mins })}
                </Button>
              )}
            </For>
          </div>
          <div class="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label class="block text-sm font-medium text-fg" for="timer-minutes">{u.minutesLabel}</label>
              <input
                id="timer-minutes"
                type="number"
                min="0"
                max="1440"
                class="mt-1 w-24 rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
                value={durationMinutes()}
                disabled={running()}
                onInput={(e) => onDurationChange(Number(e.currentTarget.value) || 0, durationSeconds())}
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-fg" for="timer-seconds">{u.secondsLabel}</label>
              <input
                id="timer-seconds"
                type="number"
                min="0"
                max="59"
                class="mt-1 w-24 rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
                value={durationSeconds()}
                disabled={running()}
                onInput={(e) => onDurationChange(durationMinutes(), Number(e.currentTarget.value) || 0)}
              />
            </div>
          </div>
          <Show when={running()}>
            <p class="mt-2 text-xs text-muted">{u.lengthLockedHint}</p>
          </Show>
        </section>

        {/* Message */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.messageHeading}</h2>
          <label class="mt-3 block text-sm font-medium text-fg" for="timer-headline">{u.headlineLabel}</label>
          <input
            id="timer-headline"
            type="text"
            class="mt-1 w-full max-w-lg rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
            placeholder={u.headlinePlaceholder}
            value={settings().headline}
            onInput={(e) => patch({ headline: e.currentTarget.value })}
          />
          <label class="mt-4 block text-sm font-medium text-fg" for="timer-subline">{u.sublineLabel}</label>
          <input
            id="timer-subline"
            type="text"
            class="mt-1 w-full max-w-lg rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
            placeholder={u.sublinePlaceholder}
            value={settings().subline}
            onInput={(e) => patch({ subline: e.currentTarget.value })}
          />
          <p class="mt-2 text-xs text-muted">{u.emojiHint}</p>
        </section>

        {/* Appearance */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.appearanceHeading}</h2>
          <div class="mt-3 flex flex-wrap items-end gap-6">
            <div>
              <label class="block text-sm font-medium text-fg" for="timer-bg">{u.backgroundLabel}</label>
              <input
                id="timer-bg"
                type="color"
                class="mt-1 h-11 w-16 cursor-pointer rounded border border-border bg-bg"
                value={settings().background}
                onInput={(e) => patch({ background: e.currentTarget.value })}
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-fg" for="timer-fg">{u.textColorLabel}</label>
              <input
                id="timer-fg"
                type="color"
                class="mt-1 h-11 w-16 cursor-pointer rounded border border-border bg-bg"
                value={settings().textColor}
                onInput={(e) => patch({ textColor: e.currentTarget.value })}
              />
            </div>
            <div>
              <p class="mb-1 text-sm font-medium text-fg">{u.keyColorLabel}</p>
              <div class="flex gap-2">
                <For each={KEY_COLOURS}>
                  {(colour) => (
                    <button
                      type="button"
                      aria-label={fmt(u.keyColorSwatch, { colour })}
                      onClick={() => patch({ background: colour })}
                      class="h-11 w-11 cursor-pointer rounded border border-border"
                      style={{ background: colour }}
                    />
                  )}
                </For>
              </div>
            </div>
          </div>
          <label class="mt-4 block text-sm font-medium text-fg" for="timer-scale">{u.fontScaleLabel}</label>
          <input
            id="timer-scale"
            type="range"
            class="mt-1 w-full max-w-lg cursor-pointer"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step="0.05"
            value={settings().fontScale}
            onInput={(e) => patch({ fontScale: Number(e.currentTarget.value) })}
          />
          <p class="mt-1 text-xs text-muted">{u.keyColorHint}</p>
          <label class="mt-4 flex items-center gap-3 text-sm text-fg">
            <Switch checked={settings().confettiEnabled} onChange={(v) => patch({ confettiEnabled: v })} />
            {u.confettiToggle}
          </label>
        </section>

        {/* Bell */}
        <section>
          <h2 class="text-base font-semibold text-fg">{u.bellHeading}</h2>
          <label class="mt-3 flex items-center gap-3 text-sm text-fg">
            <Switch checked={settings().bellEnabled} onChange={(v) => patch({ bellEnabled: v })} />
            {u.bellToggle}
          </label>

          <label class="mt-4 block text-sm font-medium text-fg" for="timer-volume">{u.bellVolumeLabel}</label>
          <input
            id="timer-volume"
            type="range"
            class="mt-1 w-full max-w-lg cursor-pointer"
            min="0"
            max="1"
            step="0.05"
            value={settings().bellVolume}
            onInput={(e) => patch({ bellVolume: Number(e.currentTarget.value) })}
          />

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void onTestBell()}>{u.testBell}</Button>
            <Show when={audioBlocked()}>
              <span class="text-sm text-muted" role="status">{u.bellBlocked}</span>
            </Show>
          </div>

          <Show
            when={canPickOutput}
            fallback={<p class="mt-4 max-w-prose text-xs text-muted">{u.outputUnsupported}</p>}
          >
            <label class="mt-4 block text-sm font-medium text-fg" for="timer-output">{u.outputLabel}</label>
            <select
              id="timer-output"
              class="mt-1 w-full max-w-lg rounded border border-border bg-bg px-3 py-2 text-sm text-fg"
              value={settings().sinkId}
              onFocus={() => void loadOutputs()}
              onChange={(e) => void onSinkChange(e.currentTarget.value)}
            >
              <option value="">{u.outputDefault}</option>
              <For each={outputs()}>
                {(device, i) => (
                  <option value={device.deviceId}>
                    {device.label || fmt(u.outputUnnamed, { n: i() + 1 })}
                  </option>
                )}
              </For>
            </select>
            <p class="mt-1 max-w-prose text-xs text-muted">{u.outputPermissionNote}</p>
          </Show>
        </section>
      </div>

      <ToolContent route="stream-timer" />
    </main>
  );
}

export default function StreamTimer() {
  const location = useLocation();
  const isDisplay = () => new URLSearchParams(location.search).get('display') === '1';
  return <Show when={isDisplay()} fallback={<ControlPanel />}><DisplaySurface /></Show>;
}
