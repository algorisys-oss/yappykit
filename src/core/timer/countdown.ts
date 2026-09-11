/**
 * The countdown itself: phase, time math, and the clock format.
 *
 * The whole module is pure functions over a serialisable value, and `now` is
 * always passed in rather than read. That is what lets the same state drive two
 * windows: the control page owns it, posts it to the display page, and both
 * render from identical inputs.
 *
 * REMAINING IS DERIVED, NEVER ACCUMULATED. A running countdown stores the
 * absolute instant it reaches zero and subtracts. Ticking a counter down would
 * lose time on every throttled frame, and a background tab is throttled hard
 * (Chrome drops hidden tabs to one timer wake a second, then to one a minute)
 * which is exactly the state a timer sits in while the streamer is on another
 * window. `endsAt` is unaffected by any of that.
 *
 * `remainingMs` is only meaningful when the timer is NOT running; while it runs
 * it holds the last known remainder and `endsAt` is the truth. Read through
 * `remainingAt` and the distinction never leaks.
 */

export type Phase = 'idle' | 'running' | 'paused' | 'elapsed';

export interface Countdown {
  readonly phase: Phase;
  /** What the timer was set to, and what `reset` returns to. */
  readonly durationMs: number;
  /** Wall-clock instant of zero. Non-null only while running. */
  readonly endsAt: number | null;
  /** The remainder while not running. See the note above. */
  readonly remainingMs: number;
}

export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 24 * 60 * 60 * 1_000;

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return MIN_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(ms)));
}

export function createCountdown(durationMs: number): Countdown {
  const d = clampDuration(durationMs);
  return { phase: 'idle', durationMs: d, endsAt: null, remainingMs: d };
}

export function remainingAt(c: Countdown, now: number): number {
  if (c.phase === 'running' && c.endsAt !== null) return Math.max(0, c.endsAt - now);
  return c.remainingMs;
}

/**
 * Begin counting. An elapsed timer restarts at its full duration; anything else
 * picks up whatever is left, so time added before pressing start is not lost.
 */
export function start(c: Countdown, now: number): Countdown {
  const remaining = c.phase === 'elapsed' ? c.durationMs : c.remainingMs;
  return { phase: 'running', durationMs: c.durationMs, endsAt: now + remaining, remainingMs: remaining };
}

export function pause(c: Countdown, now: number): Countdown {
  if (c.phase !== 'running') return c;
  return { phase: 'paused', durationMs: c.durationMs, endsAt: null, remainingMs: remainingAt(c, now) };
}

export function resume(c: Countdown, now: number): Countdown {
  if (c.phase !== 'paused') return c;
  return { phase: 'running', durationMs: c.durationMs, endsAt: now + c.remainingMs, remainingMs: c.remainingMs };
}

export function reset(c: Countdown): Countdown {
  return { phase: 'idle', durationMs: c.durationMs, endsAt: null, remainingMs: c.durationMs };
}

/** Retarget a timer that is not running. Changing it mid-run is `adjust`'s job. */
export function setDuration(c: Countdown, durationMs: number): Countdown {
  if (c.phase === 'running') return c;
  const d = clampDuration(durationMs);
  return { phase: c.phase === 'elapsed' ? 'idle' : c.phase, durationMs: d, endsAt: null, remainingMs: d };
}

/**
 * Add or remove time in any phase. Adding to an elapsed timer starts it running
 * again, which is the "give me two more minutes" a stream actually needs, and
 * removing the last of a running timer elapses it there and then.
 *
 * `durationMs` deliberately does not move: reset should still return to the
 * length the streamer chose, not to a length that drifted during the stream.
 */
export function adjust(c: Countdown, deltaMs: number, now: number): Countdown {
  const next = Math.min(MAX_DURATION_MS, Math.max(0, remainingAt(c, now) + deltaMs));

  if (c.phase === 'running') {
    if (next === 0) return { phase: 'elapsed', durationMs: c.durationMs, endsAt: null, remainingMs: 0 };
    return { phase: 'running', durationMs: c.durationMs, endsAt: now + next, remainingMs: next };
  }
  if (c.phase === 'elapsed') {
    if (next === 0) return c;
    return { phase: 'running', durationMs: c.durationMs, endsAt: now + next, remainingMs: next };
  }
  return { phase: c.phase, durationMs: c.durationMs, endsAt: null, remainingMs: next };
}

/**
 * Move a running timer to `elapsed` once it reaches zero, and otherwise return
 * the SAME object, so a per-frame call does not invalidate anything downstream.
 */
export function tick(c: Countdown, now: number): Countdown {
  if (c.phase !== 'running' || remainingAt(c, now) > 0) return c;
  return { phase: 'elapsed', durationMs: c.durationMs, endsAt: null, remainingMs: 0 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Clock format, rounded UP to the second: a five-minute timer reads 5:00 the
 * instant it starts. Rounding down would show 4:59 before the first frame, and
 * a countdown that starts a second late is the kind of detail an audience
 * notices. Hours appear only once there are hours.
 */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const PHASES: readonly Phase[] = ['idle', 'running', 'paused', 'elapsed'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Rebuild a `Countdown` from untrusted input, or refuse it.
 *
 * A countdown reaches this process from two places that are equally outside our
 * control: another window over BroadcastChannel, and localStorage. Both are
 * checked here rather than at each call site, so the two paths cannot drift
 * apart on what counts as a valid state.
 */
export function parseCountdown(input: unknown): Countdown | null {
  if (typeof input !== 'object' || input === null) return null;
  const c = input as Record<string, unknown>;
  if (!PHASES.includes(c.phase as Phase)) return null;
  if (!finite(c.durationMs) || !finite(c.remainingMs)) return null;
  if (c.endsAt !== null && !finite(c.endsAt)) return null;
  return {
    phase: c.phase as Phase,
    durationMs: c.durationMs,
    endsAt: c.endsAt as number | null,
    remainingMs: c.remainingMs,
  };
}
