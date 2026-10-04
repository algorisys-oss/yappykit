/**
 * Time-zone arithmetic for the world clock, on top of the browser's own zone
 * database. No offsets are stored or hard-coded anywhere: every answer is read
 * from Intl at the instant in question, which is what makes daylight saving
 * correct without this file knowing when anyone changes their clocks.
 */

export interface WallTime {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  /** 0 to 23. */
  hour: number;
  minute: number;
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(zone);
  if (!f) {
    // h23, not hour12: false. Older engines render midnight as "24" under
    // hour12: false, which would put the clock a day ahead for an hour.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    FORMATTERS.set(zone, f);
  }
  return f;
}

function partsAt(zone: string, instant: number): WallTime & { second: number } {
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of partsFormatter(zone).formatToParts(instant)) {
    if (p.type in out) out[p.type as keyof typeof out] = Number(p.value);
  }
  return out;
}

/** What a clock on the wall in `zone` reads at `instant`. */
export function wallTime(zone: string, instant: number): WallTime {
  const { second: _second, ...wall } = partsAt(zone, instant);
  return wall;
}

/** Minutes the zone is ahead of UTC at `instant` (India: 330, New York in July: -240). */
export function offsetMinutes(zone: string, instant: number): number {
  const p = partsAt(zone, instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const floored = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc - floored) / 60_000);
}

/**
 * The instant at which a wall clock in `zone` shows this date and time.
 *
 * Guess with the offset at the naive instant, then correct once with the offset
 * at the guess, which settles every case except the two a DST change creates.
 * A time skipped by spring-forward (2:30 on the night New York jumps from 2:00
 * to 3:00) has no instant, and this lands an hour either side of it. A time
 * repeated by fall-back has two, and this returns one of them. Both are what a
 * person scheduling a call at that hour would accept.
 */
export function instantAt(zone: string, wall: WallTime): number {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = naive - offsetMinutes(zone, naive) * 60_000;
  const second = naive - offsetMinutes(zone, first) * 60_000;
  return second;
}

/** Midnight that begins the zone's calendar day containing `instant`. */
export function startOfDay(zone: string, instant: number): number {
  const w = wallTime(zone, instant);
  return instantAt(zone, { ...w, hour: 0, minute: 0 });
}

/** The same wall time `days` calendar days later, across month and year ends. */
export function shiftDays(wall: WallTime, days: number): WallTime {
  const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + days));
  return { ...wall, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Ordinal day number of a wall date, for comparing dates across zones. */
const dayNumber = (w: WallTime) => Date.UTC(w.year, w.month - 1, w.day) / 86_400_000;

/**
 * Whether `zone` is on the day before, the same day as, or the day after `home`
 * at this instant. Always -1, 0 or 1: no two zones are more than 26 hours apart.
 */
export function dayShift(zone: string, home: string, instant: number): number {
  return dayNumber(wallTime(zone, instant)) - dayNumber(wallTime(home, instant));
}

/**
 * The difference a person reads off two clocks: "+9:30", "-5:30", "0".
 * Relative to home, because "UTC+5:30" answers a question nobody planning a
 * call is asking.
 */
export function relativeOffset(zone: string, home: string, instant: number): number {
  return offsetMinutes(zone, instant) - offsetMinutes(home, instant);
}

export function formatRelativeOffset(minutes: number): string {
  if (minutes === 0) return '0';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${sign}${h}:${String(m).padStart(2, '0')}` : `${sign}${h}`;
}

/**
 * How reasonable an hour is to ask of someone: the working day, the edges a
 * person might stretch to for a call, or the night. A guide drawn from the
 * common office day, not a claim about anybody's actual schedule.
 */
export type HourBand = 'work' | 'edge' | 'night';

export function hourBand(hour: number): HourBand {
  if (hour >= 9 && hour < 18) return 'work';
  if ((hour >= 7 && hour < 9) || (hour >= 18 && hour < 22)) return 'edge';
  return 'night';
}
