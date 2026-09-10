import { describe, it, expect, afterEach } from 'vitest';
import { createCountdown, start } from './countdown';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { openTimerChannel, parseMessage, type TimerChannel, type TimerMessage } from './channel';

const T0 = 1_700_000_000_000;

/**
 * Wait for the next message, or for the wait to run out.
 *
 * Delivery is asynchronous and the delay is not specified anywhere, so a fixed
 * sleep is a coin toss: the positive case here failed roughly one run in two
 * against a single macrotask. Waiting on the message itself removes the race,
 * and proving a NEGATIVE still needs a deadline, which is what `timeoutMs` is.
 */
function nextMessage(channel: TimerChannel, timeoutMs = 1000): Promise<TimerMessage | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.onMessage((message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

const open: TimerChannel[] = [];
function channel(name: string) {
  const c = openTimerChannel(name);
  open.push(c);
  return c;
}
afterEach(() => {
  while (open.length) open.pop()!.close();
});

describe('carrying state between the two windows', () => {
  it('delivers a state message to the other window', async () => {
    const control = channel('t1');
    const display = channel('t1');
    const arrived = nextMessage(display);

    const countdown = start(createCountdown(300_000), T0);
    control.post({ type: 'state', countdown, settings: DEFAULT_SETTINGS });

    expect(await arrived).toEqual({ type: 'state', countdown, settings: DEFAULT_SETTINGS });
  });

  it('does not deliver a window its own messages', async () => {
    const control = channel('t2');
    const arrived = nextMessage(control, 50);
    control.post({ type: 'hello' });
    expect(await arrived).toBeNull();
  });

  it('keeps separate channels separate', async () => {
    const a = channel('t3');
    const b = channel('other');
    const arrived = nextMessage(b, 50);
    a.post({ type: 'hello' });
    expect(await arrived).toBeNull();
  });

  it('stops delivering once closed', async () => {
    const control = channel('t4');
    const display = channel('t4');
    const arrived = nextMessage(display, 50);
    display.close();
    control.post({ type: 'hello' });
    expect(await arrived).toBeNull();
  });

  it('is a no-op rather than a crash where BroadcastChannel is missing', () => {
    const saved = globalThis.BroadcastChannel;
    // @ts-expect-error deliberately removing the API to model an old browser
    delete globalThis.BroadcastChannel;
    try {
      const c = openTimerChannel('t5');
      expect(c.supported).toBe(false);
      expect(() => c.post({ type: 'hello' })).not.toThrow();
      expect(() => c.onMessage(() => {})).not.toThrow();
      expect(() => c.close()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = saved;
    }
  });
});

describe('validating what arrives', () => {
  const countdown = start(createCountdown(300_000), T0);

  it('accepts a well-formed state message', () => {
    const parsed = parseMessage({ type: 'state', countdown, settings: DEFAULT_SETTINGS });
    expect(parsed).toEqual({ type: 'state', countdown, settings: DEFAULT_SETTINGS });
  });

  it('accepts the bare signals', () => {
    expect(parseMessage({ type: 'hello' })).toEqual({ type: 'hello' });
    expect(parseMessage({ type: 'closing' })).toEqual({ type: 'closing' });
  });

  it('repairs settings that arrive damaged instead of rendering them', () => {
    const parsed = parseMessage({
      type: 'state',
      countdown,
      settings: { ...DEFAULT_SETTINGS, background: 'javascript:alert(1)', bellVolume: 40 },
    });
    expect(parsed).toEqual({
      type: 'state',
      countdown,
      settings: normalizeSettings({ ...DEFAULT_SETTINGS, bellVolume: 40 }),
    });
  });

  it('rejects a countdown with a bad phase or a non-numeric clock', () => {
    expect(parseMessage({ type: 'state', countdown: { ...countdown, phase: 'x' }, settings: DEFAULT_SETTINGS })).toBeNull();
    expect(parseMessage({ type: 'state', countdown: { ...countdown, endsAt: 'soon' }, settings: DEFAULT_SETTINGS })).toBeNull();
    expect(parseMessage({ type: 'state', countdown: { ...countdown, remainingMs: Number.NaN }, settings: DEFAULT_SETTINGS })).toBeNull();
  });

  it('rejects junk', () => {
    for (const junk of [null, undefined, 7, 'state', {}, { type: 'nope' }, { type: 'state' }]) {
      expect(parseMessage(junk)).toBeNull();
    }
  });
});
