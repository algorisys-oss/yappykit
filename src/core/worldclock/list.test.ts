import { describe, it, expect } from 'vitest';
import {
  MAX_CLOCKS, normalizeZones, addZone, removeZone, makeHome,
  loadPrefs, savePrefs, encodeShare, decodeShare,
} from './list';

function storage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  } as unknown as Storage & { raw: Map<string, string> };
}

describe('normalizing a list', () => {
  it('starts from home when there is nothing usable', () => {
    expect(normalizeZones(undefined, 'Asia/Calcutta')).toEqual(['Asia/Kolkata']);
    expect(normalizeZones('nonsense', 'UTC')).toEqual(['UTC']);
    expect(normalizeZones(['Nowhere/Atlantis', 7], 'UTC')).toEqual(['UTC']);
  });

  it('drops invalid entries and collapses spellings of one zone', () => {
    expect(normalizeZones(['Asia/Kolkata', 'bogus', 'Asia/Calcutta', 'Europe/London'], 'UTC'))
      .toEqual(['Asia/Kolkata', 'Europe/London']);
  });

  it('caps the length', () => {
    const many = ['UTC', 'Asia/Tokyo', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
      'Europe/Madrid', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Athens',
      'Europe/Warsaw', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka',
      'Asia/Bangkok', 'Asia/Singapore', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'Pacific/Honolulu', 'America/Toronto'];
    expect(normalizeZones(many, 'UTC')).toHaveLength(MAX_CLOCKS);
  });
});

describe('editing a list', () => {
  const list = ['Asia/Kolkata', 'America/New_York'];

  it('adds a zone once, however it is spelt', () => {
    expect(addZone(list, 'Europe/London')).toEqual([...list, 'Europe/London']);
    expect(addZone(list, 'Asia/Calcutta')).toEqual(list);
  });

  it('removes a zone but never home', () => {
    expect(removeZone(list, 'America/New_York')).toEqual(['Asia/Kolkata']);
    expect(removeZone(list, 'Asia/Kolkata')).toEqual(list);
  });

  it('moves the new home to the front and keeps the rest in order', () => {
    expect(makeHome([...list, 'Europe/London'], 'Europe/London'))
      .toEqual(['Europe/London', 'Asia/Kolkata', 'America/New_York']);
  });
});

describe('remembering', () => {
  it('round-trips through storage', () => {
    const s = storage();
    savePrefs(s, { zones: ['Asia/Kolkata', 'Asia/Tokyo'], hour12: false });
    expect(loadPrefs(s, 'UTC')).toEqual({ zones: ['Asia/Kolkata', 'Asia/Tokyo'], hour12: false });
  });

  it('survives corrupt or tampered storage', () => {
    expect(loadPrefs(storage({ 'yappykit-world-clock': '{not json' }), 'UTC'))
      .toEqual({ zones: ['UTC'], hour12: null });
    expect(loadPrefs(storage({ 'yappykit-world-clock': '{"zones":"x","hour12":"yes"}' }), 'UTC'))
      .toEqual({ zones: ['UTC'], hour12: null });
  });

  it('keeps working when storage refuses to write', () => {
    const s = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(() => savePrefs(s, { zones: ['UTC'], hour12: null })).not.toThrow();
  });
});

describe('share links', () => {
  it('round-trips a list, readable in the address bar', () => {
    const hash = encodeShare(['Asia/Kolkata', 'America/New_York']);
    expect(hash).toBe('#zones=Asia%2FKolkata,America%2FNew_York');
    expect(decodeShare(hash)).toEqual(['Asia/Kolkata', 'America/New_York']);
    expect(decodeShare('#zones=Asia/Kolkata,Europe/London')).toEqual(['Asia/Kolkata', 'Europe/London']);
  });

  it('ignores a fragment that is not a share link, or carries nothing valid', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#code=abc')).toBeNull();
    expect(decodeShare('#zones=')).toBeNull();
    expect(decodeShare('#zones=<script>,%E0%A4%A')).toBeNull();
  });

  it('drops the bad entries from a link that is partly valid', () => {
    expect(decodeShare('#zones=bogus,Asia/Tokyo')).toEqual(['Asia/Tokyo']);
  });
});
