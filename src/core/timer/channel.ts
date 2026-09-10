/**
 * The link between the control page and the display window.
 *
 * The display is a second window so the streamer can capture it, or drop it on
 * a second monitor, WITHOUT the controls they are touching appearing on the
 * broadcast. BroadcastChannel carries the whole state across on every change,
 * which keeps the display a pure render of what the control page owns: no
 * shared mutable state, no ordering to get wrong, and a display that opens late
 * catches up by saying hello.
 *
 * A note on reach: this binds the two windows of ONE browser, which is what a
 * Window Capture of the display needs. OBS's Browser Source runs its own
 * embedded browser in another process, so it cannot receive these messages and
 * can only be pointed at a display that configures itself from its URL.
 *
 * Everything arriving here is treated as untrusted input. It comes from another
 * window, so `parseMessage` validates and repairs it before the display renders
 * a single field of it.
 */
import type { Countdown, Phase } from './countdown';
import { normalizeSettings, type TimerSettings } from './settings';

export type TimerMessage =
  | { type: 'state'; countdown: Countdown; settings: TimerSettings }
  /** A display window announcing itself, so the control page resends state. */
  | { type: 'hello' }
  /** A display window going away, so the control page can offer to reopen it. */
  | { type: 'closing' };

export const TIMER_CHANNEL_NAME = 'yappykit-stream-timer';

export interface TimerChannel {
  /** False where the browser has no BroadcastChannel; every method still works. */
  readonly supported: boolean;
  post(message: TimerMessage): void;
  /** Set the handler. Only valid messages are delivered; junk is dropped. */
  onMessage(handler: (message: TimerMessage) => void): void;
  close(): void;
}

const PHASES: readonly Phase[] = ['idle', 'running', 'paused', 'elapsed'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseCountdown(input: unknown): Countdown | null {
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

export function parseMessage(input: unknown): TimerMessage | null {
  if (typeof input !== 'object' || input === null) return null;
  const m = input as Record<string, unknown>;

  if (m.type === 'hello') return { type: 'hello' };
  if (m.type === 'closing') return { type: 'closing' };
  if (m.type !== 'state') return null;

  const countdown = parseCountdown(m.countdown);
  if (countdown === null) return null;
  return { type: 'state', countdown, settings: normalizeSettings(m.settings) };
}

/** A channel that is inert rather than absent when the API is missing. */
const INERT: TimerChannel = {
  supported: false,
  post: () => {},
  onMessage: () => {},
  close: () => {},
};

export function openTimerChannel(name: string = TIMER_CHANNEL_NAME): TimerChannel {
  if (typeof BroadcastChannel !== 'function') return INERT;

  const bc = new BroadcastChannel(name);
  return {
    supported: true,
    post: (message) => bc.postMessage(message),
    onMessage: (handler) => {
      bc.onmessage = (event: MessageEvent) => {
        const message = parseMessage(event.data);
        if (message !== null) handler(message);
      };
    },
    close: () => {
      bc.onmessage = null;
      bc.close();
    },
  };
}
