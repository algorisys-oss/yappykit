import { describe, it, expect } from 'vitest';
import { createCountdown, start, pause, type Countdown } from './countdown';
import { restoreCountdown, parseSession, loadSession, saveSession, type TimerSession } from './session';

const FIVE_MIN = 5 * 60_000;
const T0 = 1_700_000_000_000;

function storage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

const session = (countdown: Countdown, savedAt = T0): TimerSession => ({ countdown, savedAt });

describe('restoring a run', () => {
  it('brings back a countdown that is still running', () => {
    const running = start(createCountdown(FIVE_MIN), T0);
    const back = restoreCountdown(session(running), T0 + 60_000);

    expect(back?.phase).toBe('running');
    expect(back?.endsAt).toBe(T0 + FIVE_MIN);
  });

  it('restores a long timer however old the record is, because it is still counting', () => {
    const running = start(createCountdown(24 * 60 * 60_000), T0);
    const back = restoreCountdown(session(running), T0 + 10 * 60 * 60_000);

    expect(back?.phase).toBe('running');
    expect(back?.endsAt).toBe(T0 + 24 * 60 * 60_000);
  });

  it('comes back elapsed when it finished while the tab was gone', () => {
    const running = start(createCountdown(FIVE_MIN), T0);
    const back = restoreCountdown(session(running), T0 + FIVE_MIN + 20_000);

    expect(back?.phase).toBe('elapsed');
    expect(back?.remainingMs).toBe(0);
  });

  it('forgets a countdown that finished more than its own length ago', () => {
    const running = start(createCountdown(FIVE_MIN), T0);
    expect(restoreCountdown(session(running), T0 + FIVE_MIN + FIVE_MIN + 1)).toBeNull();
  });

  it('still restores exactly one length past zero', () => {
    const running = start(createCountdown(FIVE_MIN), T0);
    expect(restoreCountdown(session(running), T0 + FIVE_MIN + FIVE_MIN)?.phase).toBe('elapsed');
  });

  it('brings back a pause with its remainder intact', () => {
    const paused = pause(start(createCountdown(FIVE_MIN), T0), T0 + 60_000);
    const back = restoreCountdown(session(paused, T0 + 60_000), T0 + 120_000);

    expect(back?.phase).toBe('paused');
    expect(back?.remainingMs).toBe(FIVE_MIN - 60_000);
  });

  it('forgets a pause left for longer than the timer itself', () => {
    const paused = pause(start(createCountdown(FIVE_MIN), T0), T0 + 60_000);
    expect(restoreCountdown(session(paused, T0 + 60_000), T0 + 60_000 + FIVE_MIN + 1)).toBeNull();
  });

  it('forgets an elapsed timer from hours ago rather than greeting you with confetti', () => {
    const elapsed: Countdown = { phase: 'elapsed', durationMs: FIVE_MIN, endsAt: null, remainingMs: 0 };
    expect(restoreCountdown(session(elapsed), T0 + 4 * 60 * 60_000)).toBeNull();
  });

  it('keeps an elapsed timer that has only just finished', () => {
    const elapsed: Countdown = { phase: 'elapsed', durationMs: FIVE_MIN, endsAt: null, remainingMs: 0 };
    expect(restoreCountdown(session(elapsed), T0 + 10_000)?.phase).toBe('elapsed');
  });

  it('has nothing to restore from an idle timer', () => {
    expect(restoreCountdown(session(createCountdown(FIVE_MIN)), T0 + 1000)).toBeNull();
  });

  it('discards a running record with no instant of zero to trust', () => {
    const broken: Countdown = { phase: 'running', durationMs: FIVE_MIN, endsAt: null, remainingMs: FIVE_MIN };
    expect(restoreCountdown(session(broken), T0 + 1000)).toBeNull();
  });
});

describe('parsing a stored run', () => {
  it('rejects anything that is not an object', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('running')).toBeNull();
  });

  it('rejects a record with no usable countdown', () => {
    expect(parseSession({ savedAt: T0 })).toBeNull();
    expect(parseSession({ countdown: { phase: 'sprinting' }, savedAt: T0 })).toBeNull();
  });

  it('rejects a record with no usable timestamp', () => {
    const countdown = start(createCountdown(FIVE_MIN), T0);
    expect(parseSession({ countdown })).toBeNull();
    expect(parseSession({ countdown, savedAt: 'yesterday' })).toBeNull();
    expect(parseSession({ countdown, savedAt: Number.NaN })).toBeNull();
  });

  it('accepts a well-formed record', () => {
    const countdown = start(createCountdown(FIVE_MIN), T0);
    expect(parseSession({ countdown, savedAt: T0 })).toEqual({ countdown, savedAt: T0 });
  });
});

describe('persistence', () => {
  it('round-trips a running countdown through storage', () => {
    const s = storage();
    const running = start(createCountdown(FIVE_MIN), T0);
    saveSession(s, running, T0);

    expect(loadSession(s, T0 + 60_000)).toEqual(running);
  });

  it('loses no time across the reload', () => {
    const s = storage();
    saveSession(s, start(createCountdown(FIVE_MIN), T0), T0);

    const back = loadSession(s, T0 + 120_000);
    expect(back?.endsAt).toBe(T0 + FIVE_MIN);
  });

  it('returns nothing when no run was saved', () => {
    expect(loadSession(storage(), T0)).toBeNull();
  });

  it('returns nothing rather than throwing on corrupt storage', () => {
    expect(loadSession(storage({ 'yappykit-stream-timer-run': '{ not json' }), T0)).toBeNull();
  });

  it('clears the record once the timer is back to idle', () => {
    const s = storage();
    saveSession(s, start(createCountdown(FIVE_MIN), T0), T0);
    saveSession(s, createCountdown(FIVE_MIN), T0 + 1000);

    expect(s.raw.size).toBe(0);
    expect(loadSession(s, T0 + 1000)).toBeNull();
  });

  it('leaves the saved settings alone', () => {
    const s = storage({ 'yappykit-stream-timer': '{"headline":"Back soon"}' });
    saveSession(s, start(createCountdown(FIVE_MIN), T0), T0);

    expect(s.raw.get('yappykit-stream-timer')).toBe('{"headline":"Back soon"}');
  });

  it('survives storage that throws, as it does in private mode', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(loadSession(hostile, T0)).toBeNull();
    expect(() => saveSession(hostile, start(createCountdown(FIVE_MIN), T0), T0)).not.toThrow();
    expect(() => saveSession(hostile, createCountdown(FIVE_MIN), T0)).not.toThrow();
  });
});
