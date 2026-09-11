/**
 * The run state across a reload.
 *
 * A break does not stop because the streamer refreshed the page, so the
 * countdown itself is persisted as well as the settings. It is kept apart from
 * them because the two have different lifetimes: settings are preferences and
 * are meant to survive forever, a run is worth restoring only while it is
 * plausibly still the break the audience is looking at. Its own key also means
 * the saved settings keep their shape, so an existing record still loads.
 *
 * WHAT MAKES THIS SAFE IS `endsAt`. The countdown stores the absolute instant
 * it reaches zero, so replaying a record is just arithmetic against the clock:
 * a timer restored two minutes later is two minutes further along, with no
 * accounting for how long the tab was closed.
 */
import { parseCountdown, tick, type Countdown } from './countdown';

export interface TimerSession {
  countdown: Countdown;
  /** Wall clock at the save. A dormant record's age is measured from here. */
  savedAt: number;
}

const STORAGE_KEY = 'yappykit-stream-timer-run';

/**
 * Decide what a stored run is worth now, which is the whole judgement in this
 * module. A record is either still live, recently dead, or history:
 *
 * - Still running, so the instant of zero has not arrived. Restore it whatever
 *   its age; a twelve-hour countdown reopened after ten is simply still going.
 * - Ran out while the tab was away. Coming back to a finished timer is right
 *   after a refresh mid-break and wrong the next morning, where it would ring
 *   in an empty room and throw confetti at nobody. The line between the two is
 *   the timer's OWN LENGTH: a break is interesting for about as long again as
 *   it lasted, which scales with the timer instead of picking an hour out of
 *   the air.
 * - Paused or already finished, holding no deadline of its own, so the same
 *   allowance runs from when it was saved.
 *
 * Idle restores nothing. There is nothing in it the settings do not already
 * carry, and resurrecting one would only overwrite a fresh start.
 */
export function restoreCountdown(session: TimerSession, now: number): Countdown | null {
  const c = session.countdown;

  if (c.phase === 'running' && c.endsAt !== null) {
    if (c.endsAt > now) return c;
    return now - c.endsAt > c.durationMs ? null : tick(c, now);
  }

  if (c.phase === 'paused' || c.phase === 'elapsed') {
    return now - session.savedAt > c.durationMs ? null : c;
  }

  return null;
}

export function parseSession(input: unknown): TimerSession | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;

  const countdown = parseCountdown(raw.countdown);
  if (countdown === null) return null;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;

  return { countdown, savedAt: raw.savedAt };
}

/**
 * The countdown to pick up, or null for a fresh start. Storage access is
 * wrapped because it genuinely throws in private mode and with site data
 * blocked, and losing a restore is a shrug next to taking the tool down.
 */
export function loadSession(storage: Pick<Storage, 'getItem'>, now: number): Countdown | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const session = parseSession(JSON.parse(raw));
    return session === null ? null : restoreCountdown(session, now);
  } catch {
    return null;
  }
}

/** Idle removes the record rather than storing one, so a reset is not undone by a reload. */
export function saveSession(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  countdown: Countdown,
  now: number,
): void {
  try {
    if (countdown.phase === 'idle') storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify({ countdown, savedAt: now }));
  } catch {
    /* As above: the timer works either way. */
  }
}
