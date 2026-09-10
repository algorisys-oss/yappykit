/**
 * The bell, synthesised rather than shipped as an audio file: a few sine
 * partials and an exponential decay cost nothing to download and there is no
 * sample licence to worry about.
 *
 * TWO THINGS DECIDE WHETHER A TIMER'S ALARM ACTUALLY SOUNDS, and both are
 * handled here rather than at the call site:
 *
 * 1. AUTOPLAY. A browser will not let a page make noise until the user has
 *    interacted with it, and an AudioContext created outside a gesture starts
 *    suspended. `unlock` exists to be called from the click that starts the
 *    timer, which is the only moment the permission is reliably granted.
 *
 * 2. THROTTLING. A hidden tab's timers are slowed to once a second and
 *    eventually once a minute, so a bell fired from setTimeout rings late or
 *    not at all, and a timer running behind the streaming software is always
 *    hidden. The strike is therefore scheduled AHEAD on the audio clock, which
 *    runs on the audio thread and is not throttled with the page. Nothing has
 *    to be awake at zero for the bell to ring on time.
 */

export interface BellPartial {
  /** Frequency as a multiple of the fundamental. */
  ratio: number;
  gain: number;
  /** Seconds for this partial to fade out. */
  decay: number;
}

export const BASE_HZ = 440;

/**
 * A bell's partials are deliberately NOT whole-number multiples. The minor
 * third at 1.2 and the fifth at 1.5 are what the ear hears as "bell"; stack
 * integer harmonics instead and it sounds like an organ pipe. Low partials
 * ring on, high ones die quickly, which is the shape of a struck strike tone.
 */
export const BELL_PARTIALS: readonly BellPartial[] = [
  { ratio: 0.5, gain: 0.18, decay: 3.2 },
  { ratio: 1.0, gain: 0.22, decay: 2.6 },
  { ratio: 1.2, gain: 0.16, decay: 2.0 },
  { ratio: 1.5, gain: 0.12, decay: 1.6 },
  { ratio: 2.0, gain: 0.14, decay: 1.2 },
  { ratio: 2.5, gain: 0.08, decay: 0.8 },
  { ratio: 3.0, gain: 0.06, decay: 0.55 },
  { ratio: 4.2, gain: 0.03, decay: 0.35 },
];

/** An exponential ramp cannot reach zero, so silence is this instead. */
const SILENT = 0.0001;
const ATTACK_S = 0.004;

export function peakGainFor(partial: BellPartial, volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return Math.max(SILENT, partial.gain * v);
}

export function strikeAt(audioTime: number, inMs: number): number {
  return audioTime + Math.max(0, inMs) / 1000;
}

export function bellDurationMs(): number {
  return Math.max(...BELL_PARTIALS.map((p) => p.decay)) * 1000;
}

/** AudioContext.setSinkId is Chromium-only and not yet in the DOM typings. */
type SinkCapableContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export interface AudioOutput {
  deviceId: string;
  label: string;
}

/**
 * The output devices the browser will admit to.
 *
 * Labels come back EMPTY until the user has granted a media permission at least
 * once, which is a privacy protection and not a bug. The caller has to be
 * honest about that rather than render a list of blanks.
 */
export async function listAudioOutputs(): Promise<AudioOutput[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  } catch {
    return [];
  }
}

export interface Bell {
  /** Create and resume the audio context. Call this from a user gesture. */
  unlock(): Promise<boolean>;
  /** Schedule a strike `inMs` from now, on the audio clock. */
  ringIn(inMs: number, volume: number): void;
  ringNow(volume: number): void;
  /** Drop any strike that has not sounded yet. */
  cancel(): void;
  setSink(deviceId: string): Promise<boolean>;
  close(): void;
}

export function createBell(): Bell {
  let ctx: AudioContext | null = null;
  let pending: { osc: OscillatorNode; gain: GainNode }[] = [];

  function strike(when: number, volume: number): void {
    if (!ctx) return;
    for (const partial of BELL_PARTIALS) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = BASE_HZ * partial.ratio;

      const peak = peakGainFor(partial, volume);
      gain.gain.setValueAtTime(SILENT, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(SILENT, when + partial.decay);

      osc.connect(gain).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + partial.decay + 0.05);

      const node = { osc, gain };
      pending.push(node);
      osc.onended = () => {
        gain.disconnect();
        pending = pending.filter((p) => p !== node);
      };
    }
  }

  return {
    async unlock() {
      try {
        ctx ??= new AudioContext();
        // Created inside a gesture it is usually already running; resumed here
        // as well because a context can be suspended again by the browser.
        if (ctx.state === 'suspended') await ctx.resume();
        return ctx.state === 'running';
      } catch {
        return false;
      }
    },

    ringIn(inMs, volume) {
      if (!ctx) return;
      strike(strikeAt(ctx.currentTime, inMs), volume);
    },

    ringNow(volume) {
      if (!ctx) return;
      strike(ctx.currentTime, volume);
    },

    cancel() {
      for (const { osc, gain } of pending) {
        osc.onended = null;
        try {
          osc.stop();
        } catch {
          /* Already stopped: stopping twice throws and means nothing. */
        }
        gain.disconnect();
      }
      pending = [];
    },

    async setSink(deviceId) {
      const sinkable = ctx as SinkCapableContext | null;
      if (!sinkable?.setSinkId) return false;
      try {
        await sinkable.setSinkId(deviceId);
        return true;
      } catch {
        return false;
      }
    },

    close() {
      this.cancel();
      void ctx?.close();
      ctx = null;
    },
  };
}
