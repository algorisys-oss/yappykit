import { describe, it, expect } from 'vitest';
import {
  MAX_DURATION_MS, MIN_DURATION_MS,
  createCountdown, start, pause, resume, reset, adjust, setDuration,
  remainingAt, tick, clampDuration, formatRemaining,
} from './countdown';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('starting and running', () => {
  it('is idle at its full duration before it starts', () => {
    const c = createCountdown(5 * MIN);
    expect(c.phase).toBe('idle');
    expect(remainingAt(c, T0)).toBe(5 * MIN);
    expect(c.endsAt).toBeNull();
  });

  it('pins an absolute end instant on start', () => {
    const c = start(createCountdown(5 * MIN), T0);
    expect(c.phase).toBe('running');
    expect(c.endsAt).toBe(T0 + 5 * MIN);
  });

  it('derives remaining from the end instant, not from accumulated ticks', () => {
    const c = start(createCountdown(5 * MIN), T0);
    expect(remainingAt(c, T0 + 90_000)).toBe(5 * MIN - 90_000);
    // A tab that was throttled for four minutes still reports the truth.
    expect(remainingAt(c, T0 + 4 * MIN)).toBe(MIN);
  });

  it('never reports negative time once it is past zero', () => {
    const c = start(createCountdown(MIN), T0);
    expect(remainingAt(c, T0 + 10 * MIN)).toBe(0);
  });

  it('restarts from the full duration when started again after elapsing', () => {
    const c = tick(start(createCountdown(MIN), T0), T0 + MIN);
    expect(c.phase).toBe('elapsed');
    const again = start(c, T0 + 10 * MIN);
    expect(again.phase).toBe('running');
    expect(again.endsAt).toBe(T0 + 10 * MIN + MIN);
  });
});

describe('pause and resume', () => {
  it('freezes the remainder on pause', () => {
    const c = pause(start(createCountdown(5 * MIN), T0), T0 + 2 * MIN);
    expect(c.phase).toBe('paused');
    expect(c.endsAt).toBeNull();
    expect(remainingAt(c, T0 + 90 * MIN)).toBe(3 * MIN);
  });

  it('resumes for exactly the time that was left, however long the pause was', () => {
    const paused = pause(start(createCountdown(5 * MIN), T0), T0 + 2 * MIN);
    const c = resume(paused, T0 + 60 * MIN);
    expect(c.phase).toBe('running');
    expect(c.endsAt).toBe(T0 + 60 * MIN + 3 * MIN);
  });

  it('survives a pause/resume cycle without drifting', () => {
    let c = start(createCountdown(10 * MIN), T0);
    for (let i = 1; i <= 20; i++) {
      c = pause(c, T0 + i * 1000);
      c = resume(c, T0 + i * 1000);
    }
    expect(remainingAt(c, T0 + 20_000)).toBe(10 * MIN - 20_000);
  });

  it('ignores a pause when it is not running', () => {
    const idle = createCountdown(MIN);
    expect(pause(idle, T0)).toBe(idle);
  });

  it('ignores a resume when it is not paused', () => {
    const running = start(createCountdown(MIN), T0);
    expect(resume(running, T0)).toBe(running);
  });
});

describe('adjusting time', () => {
  it('pushes the end instant out while running', () => {
    const c = adjust(start(createCountdown(5 * MIN), T0), MIN, T0 + MIN);
    expect(c.endsAt).toBe(T0 + 6 * MIN);
  });

  it('pulls the end instant in while running', () => {
    const c = adjust(start(createCountdown(5 * MIN), T0), -MIN, T0 + MIN);
    expect(remainingAt(c, T0 + MIN)).toBe(3 * MIN);
  });

  it('elapses when time is taken away past zero', () => {
    const c = adjust(start(createCountdown(MIN), T0), -5 * MIN, T0);
    expect(c.phase).toBe('elapsed');
    expect(remainingAt(c, T0)).toBe(0);
  });

  it('adds to the remainder while paused, without resuming it', () => {
    const paused = pause(start(createCountdown(5 * MIN), T0), T0 + 2 * MIN);
    const c = adjust(paused, MIN, T0 + 2 * MIN);
    expect(c.phase).toBe('paused');
    expect(remainingAt(c, T0 + 2 * MIN)).toBe(4 * MIN);
  });

  it('runs again when time is added to an elapsed timer', () => {
    const done = tick(start(createCountdown(MIN), T0), T0 + MIN);
    const c = adjust(done, 2 * MIN, T0 + MIN);
    expect(c.phase).toBe('running');
    expect(c.endsAt).toBe(T0 + 3 * MIN);
  });

  it('does not change what a reset goes back to', () => {
    const c = adjust(start(createCountdown(5 * MIN), T0), 3 * MIN, T0);
    expect(reset(c).phase).toBe('idle');
    expect(remainingAt(reset(c), T0)).toBe(5 * MIN);
  });

  it('will not push the timer past the maximum duration', () => {
    const c = adjust(start(createCountdown(MAX_DURATION_MS), T0), 10 * MIN, T0);
    expect(remainingAt(c, T0)).toBe(MAX_DURATION_MS);
  });
});

describe('elapsing', () => {
  it('turns a running timer into an elapsed one exactly at zero', () => {
    const running = start(createCountdown(MIN), T0);
    expect(tick(running, T0 + MIN - 1).phase).toBe('running');
    expect(tick(running, T0 + MIN).phase).toBe('elapsed');
  });

  it('returns the same object while nothing has changed, so the UI does not churn', () => {
    const running = start(createCountdown(MIN), T0);
    expect(tick(running, T0 + 1000)).toBe(running);
    const done = tick(running, T0 + MIN);
    expect(tick(done, T0 + 2 * MIN)).toBe(done);
  });

  it('leaves a paused timer sitting at zero paused', () => {
    const paused = adjust(pause(start(createCountdown(MIN), T0), T0), -MIN, T0);
    expect(paused.phase).toBe('paused');
    expect(remainingAt(paused, T0)).toBe(0);
    expect(tick(paused, T0 + MIN).phase).toBe('paused');
  });
});

describe('duration', () => {
  it('clamps a duration into the supported range', () => {
    expect(clampDuration(-5)).toBe(MIN_DURATION_MS);
    expect(clampDuration(MAX_DURATION_MS + 1)).toBe(MAX_DURATION_MS);
    expect(clampDuration(Number.NaN)).toBe(MIN_DURATION_MS);
    expect(clampDuration(5 * MIN)).toBe(5 * MIN);
  });

  it('retargets an idle timer', () => {
    const c = setDuration(createCountdown(5 * MIN), 12 * MIN);
    expect(remainingAt(c, T0)).toBe(12 * MIN);
    expect(c.phase).toBe('idle');
  });

  it('leaves a running timer alone', () => {
    const running = start(createCountdown(5 * MIN), T0);
    expect(setDuration(running, 12 * MIN)).toBe(running);
  });
});

describe('formatting', () => {
  it('rounds up, so a fresh five-minute timer reads 5:00 rather than 4:59', () => {
    expect(formatRemaining(5 * MIN)).toBe('5:00');
    expect(formatRemaining(4999)).toBe('0:05');
  });

  it('pads seconds but not the leading unit', () => {
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(9000)).toBe('0:09');
  });

  it('shows hours only once there are hours', () => {
    expect(formatRemaining(59 * MIN)).toBe('59:00');
    expect(formatRemaining(60 * MIN)).toBe('1:00:00');
    expect(formatRemaining(3_661_000)).toBe('1:01:01');
  });

  it('reads zero at zero', () => {
    expect(formatRemaining(0)).toBe('0:00');
  });
});
