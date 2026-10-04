import { describe, it, expect } from 'vitest';
import {
  CITIES, isValidZone, zoneKey, describeZone, cityFromZone, allZones, searchZones, fold,
} from './zones';

describe('the curated list', () => {
  it('has about fifty places, every one a zone the browser accepts', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(50);
    for (const c of CITIES) expect(isValidZone(c.zone), c.zone).toBe(true);
  });

  it('lists no zone twice under different spellings', () => {
    const keys = CITIES.map((c) => zoneKey(c.zone));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('zone keys', () => {
  it('folds old and new names of one zone together, whichever the engine prefers', () => {
    expect(zoneKey('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(zoneKey('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(zoneKey('Europe/Kiev')).toBe(zoneKey('Europe/Kyiv'));
    expect(zoneKey('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
    expect(zoneKey('Etc/UTC')).toBe('UTC');
  });

  it('rejects what is not a zone', () => {
    expect(isValidZone('Nowhere/Atlantis')).toBe(false);
    expect(isValidZone('')).toBe(false);
    expect(isValidZone(42)).toBe(false);
  });
});

describe('labels', () => {
  it('uses the curated city where there is one', () => {
    expect(describeZone('Asia/Calcutta').city).toBe('New Delhi');
    expect(describeZone('Asia/Shanghai').city).toBe('Beijing');
  });

  it('derives a readable place from a raw zone', () => {
    expect(cityFromZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(describeZone('America/Port_of_Spain').city).toBe('Port of Spain');
  });
});

describe('allZones', () => {
  it('starts with the curated cities and then has the rest, each once', () => {
    const zones = allZones();
    expect(zones.slice(0, CITIES.length)).toEqual(CITIES.map((c) => zoneKey(c.zone)));
    expect(zones.length).toBeGreaterThan(300);
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones).not.toContain('Asia/Calcutta');
  });
});

describe('search', () => {
  const zonesFor = (q: string, locale = 'en') => searchZones(q, locale).map((m) => m.zone);

  it('finds a city by a nearby city or the country', () => {
    expect(zonesFor('bangalore')[0]).toBe('Asia/Kolkata');
    expect(zonesFor('india')[0]).toBe('Asia/Kolkata');
    expect(zonesFor('san francisco')[0]).toBe('America/Los_Angeles');
  });

  it('offers every US zone for "USA"', () => {
    const us = zonesFor('usa');
    for (const z of ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles']) {
      expect(us).toContain(z);
    }
    // Not places that merely contain the letters.
    expect(us).not.toContain('Africa/Lusaka');
    expect(us).not.toContain('Asia/Jerusalem');
  });

  it('still falls back to a match inside a word when nothing else fits', () => {
    expect(zonesFor('kjav')).toEqual(['Atlantic/Reykjavik']);
  });

  it('ignores accents and case', () => {
    expect(zonesFor('SAO PAULO')[0]).toBe('America/Sao_Paulo');
    expect(fold('Bogotá')).toBe('bogota');
  });

  it('understands zone abbreviations and names', () => {
    expect(zonesFor('pst')[0]).toBe('America/Los_Angeles');
    expect(zonesFor('india standard time')[0]).toBe('Asia/Kolkata');
  });

  it('reaches zones outside the curated list', () => {
    expect(zonesFor('reykjavik')).toContain('Atlantic/Reykjavik');
    expect(zonesFor('port of spain')).toContain('America/Port_of_Spain');
  });

  it('puts a curated city ahead of a raw zone that matches as well', () => {
    expect(zonesFor('par')[0]).toBe('Europe/Paris');
  });

  it('matches country names in the page language', () => {
    expect(zonesFor('alemania', 'es')[0]).toBe('Europe/Berlin');
  });

  it('returns nothing for an empty query', () => {
    expect(searchZones('   ', 'en')).toEqual([]);
  });
});
