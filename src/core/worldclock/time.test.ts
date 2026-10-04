import { describe, it, expect } from 'vitest';
import {
  wallTime, offsetMinutes, instantAt, startOfDay, dayShift, shiftDays,
  relativeOffset, formatRelativeOffset, hourBand,
} from './time';

const at = (iso: string) => Date.parse(iso);

describe('offsets', () => {
  it('reads half-hour and quarter-hour zones', () => {
    expect(offsetMinutes('Asia/Kolkata', at('2026-06-01T00:00:00Z'))).toBe(330);
    expect(offsetMinutes('Asia/Kathmandu', at('2026-06-01T00:00:00Z'))).toBe(345);
  });

  it('follows daylight saving rather than a fixed number', () => {
    expect(offsetMinutes('America/New_York', at('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(offsetMinutes('America/New_York', at('2026-07-15T12:00:00Z'))).toBe(-240);
    // Southern hemisphere runs the other way round.
    expect(offsetMinutes('Australia/Sydney', at('2026-01-15T12:00:00Z'))).toBe(660);
    expect(offsetMinutes('Australia/Sydney', at('2026-07-15T12:00:00Z'))).toBe(600);
  });

  it('is unaffected by seconds and milliseconds in the instant', () => {
    expect(offsetMinutes('Asia/Kolkata', at('2026-06-01T00:00:59.999Z'))).toBe(330);
  });
});

describe('wall time', () => {
  it('reads midnight as hour 0, not 24', () => {
    expect(wallTime('UTC', at('2026-06-01T00:00:00Z'))).toEqual({
      year: 2026, month: 6, day: 1, hour: 0, minute: 0,
    });
  });

  it('crosses the date line', () => {
    const w = wallTime('Pacific/Auckland', at('2026-06-01T20:00:00Z'));
    expect([w.month, w.day, w.hour]).toEqual([6, 2, 8]);
  });
});

describe('instantAt', () => {
  it('round-trips an ordinary time', () => {
    const t = instantAt('Asia/Kolkata', { year: 2026, month: 10, day: 4, hour: 19, minute: 0 });
    expect(new Date(t).toISOString()).toBe('2026-10-04T13:30:00.000Z');
  });

  it('round-trips on either side of a DST change', () => {
    const before = instantAt('America/New_York', { year: 2026, month: 3, day: 7, hour: 9, minute: 0 });
    const after = instantAt('America/New_York', { year: 2026, month: 3, day: 9, hour: 9, minute: 0 });
    expect(new Date(before).toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(new Date(after).toISOString()).toBe('2026-03-09T13:00:00.000Z');
  });

  it('lands within an hour of a time that spring-forward skips', () => {
    // 2:30 does not exist in New York on 8 March 2026.
    const t = instantAt('America/New_York', { year: 2026, month: 3, day: 8, hour: 2, minute: 30 });
    const w = wallTime('America/New_York', t);
    expect([1, 3]).toContain(w.hour);
    expect(w.minute).toBe(30);
  });

  it('returns a real reading of a time that fall-back repeats', () => {
    const t = instantAt('America/New_York', { year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
    expect(wallTime('America/New_York', t)).toMatchObject({ hour: 1, minute: 30, day: 1 });
  });
});

describe('days', () => {
  it('finds the start of the local day', () => {
    const t = startOfDay('Asia/Kolkata', at('2026-10-04T13:30:00Z'));
    expect(new Date(t).toISOString()).toBe('2026-10-03T18:30:00.000Z');
  });

  it('says whether another zone is on yesterday, today or tomorrow', () => {
    const lateEvening = at('2026-10-04T17:00:00Z'); // 22:30 in India
    expect(dayShift('Asia/Tokyo', 'Asia/Kolkata', lateEvening)).toBe(1);
    expect(dayShift('America/New_York', 'Asia/Kolkata', lateEvening)).toBe(0);
    const earlyMorning = at('2026-10-03T19:00:00Z'); // 00:30 in India
    expect(dayShift('America/New_York', 'Asia/Kolkata', earlyMorning)).toBe(-1);
  });

  it('copes with a month and a year boundary', () => {
    const newYear = at('2026-12-31T20:00:00Z');
    expect(dayShift('Pacific/Auckland', 'UTC', newYear)).toBe(1);
  });
});

describe('shiftDays', () => {
  it('keeps the time of day and rolls over months and years', () => {
    const w = { year: 2026, month: 12, day: 31, hour: 19, minute: 15 };
    expect(shiftDays(w, 1)).toEqual({ year: 2027, month: 1, day: 1, hour: 19, minute: 15 });
    expect(shiftDays({ ...w, month: 3, day: 1 }, -1)).toMatchObject({ month: 2, day: 28 });
  });

  it('keeps the wall time across a DST change, where adding 24 hours would not', () => {
    const sat = { year: 2026, month: 3, day: 7, hour: 9, minute: 0 };
    const sun = instantAt('America/New_York', shiftDays(sat, 1));
    expect(wallTime('America/New_York', sun)).toMatchObject({ day: 8, hour: 9 });
  });
});

describe('relative offsets', () => {
  it('is measured from home, and changes when one side changes its clocks', () => {
    expect(relativeOffset('America/New_York', 'Asia/Kolkata', at('2026-07-01T00:00:00Z'))).toBe(-570);
    expect(relativeOffset('America/New_York', 'Asia/Kolkata', at('2026-01-01T00:00:00Z'))).toBe(-630);
  });

  it('formats like a person writes it', () => {
    expect(formatRelativeOffset(0)).toBe('0');
    expect(formatRelativeOffset(570)).toBe('+9:30');
    expect(formatRelativeOffset(-570)).toBe('−9:30');
    expect(formatRelativeOffset(-300)).toBe('−5');
    expect(formatRelativeOffset(45)).toBe('+0:45');
  });
});

describe('hour bands', () => {
  it('splits the day into work, edges and night', () => {
    expect(hourBand(9)).toBe('work');
    expect(hourBand(17)).toBe('work');
    expect(hourBand(18)).toBe('edge');
    expect(hourBand(7)).toBe('edge');
    expect(hourBand(21)).toBe('edge');
    expect(hourBand(22)).toBe('night');
    expect(hourBand(0)).toBe('night');
    expect(hourBand(6)).toBe('night');
  });
});
