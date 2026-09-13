import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { holdWork, reloadWhenIdle, heldCount } from './work-guard';

describe('reloading for a new version without taking anyone’s work', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('reloads straight away when nothing is held', () => {
    const reload = vi.fn();
    reloadWhenIdle(reload);
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while a tool holds work, and reloads once it lets go', () => {
    const reload = vi.fn();
    const release = holdWork();
    reloadWhenIdle(reload);
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();

    release();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits for the LAST holder, not the first to finish', () => {
    const reload = vi.fn();
    const a = holdWork();
    const b = holdWork();
    reloadWhenIdle(reload);
    a();
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
    b();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('counts a release once, however many times it is called', () => {
    // A cleanup and an effect can both release the same hold; counting that
    // twice would let a second tool's work be reloaded away.
    const a = holdWork();
    const b = holdWork();
    a();
    a();
    expect(heldCount()).toBe(1);
    b();
    expect(heldCount()).toBe(0);
  });

  it('does not reload on a release when no new version is waiting', () => {
    const reload = vi.fn();
    const a = holdWork();
    a();
    vi.runAllTimers();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a second update arrives while waiting', () => {
    const first = vi.fn();
    const second = vi.fn();
    const hold = holdWork();
    reloadWhenIdle(first);
    reloadWhenIdle(second);
    hold();
    vi.runAllTimers();
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
  });
});
