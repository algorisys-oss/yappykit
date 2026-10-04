/**
 * The clocks a person has chosen, kept on this device and carried in a share
 * link.
 *
 * The list arrives from localStorage and from a URL somebody else wrote, so
 * nothing about it is trusted: every entry must be a zone this browser accepts,
 * spellings of the same zone collapse to one, and the length is capped. The
 * first entry is home, the zone every other clock is read against.
 */
import { isValidZone, zoneKey } from './zones';

export const MAX_CLOCKS = 24;
const STORAGE_KEY = 'yappykit-world-clock';

export interface ClockPrefs {
  /** First is home. */
  zones: string[];
  hour12: boolean | null;
}

/** Repair whatever came in into a usable list, with `fallbackHome` first if it is empty. */
export function normalizeZones(input: unknown, fallbackHome: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const z of Array.isArray(input) ? input : []) {
    if (!isValidZone(z)) continue;
    const key = zoneKey(z);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length === MAX_CLOCKS) break;
  }
  return out.length ? out : [zoneKey(fallbackHome)];
}

export function addZone(zones: readonly string[], zone: string): string[] {
  const key = zoneKey(zone);
  if (zones.some((z) => zoneKey(z) === key) || zones.length >= MAX_CLOCKS) return [...zones];
  return [...zones, key];
}

/** Home cannot be removed, only replaced: a world clock is read against somewhere. */
export function removeZone(zones: readonly string[], zone: string): string[] {
  const key = zoneKey(zone);
  return zones.filter((z, i) => i === 0 || zoneKey(z) !== key);
}

export function makeHome(zones: readonly string[], zone: string): string[] {
  const key = zoneKey(zone);
  return [key, ...zones.filter((z) => zoneKey(z) !== key)];
}

export function loadPrefs(storage: Storage, fallbackHome: string): ClockPrefs {
  let raw: unknown = null;
  try {
    raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    // Unreadable or blocked storage: start fresh rather than fail.
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    zones: normalizeZones(obj.zones, fallbackHome),
    hour12: typeof obj.hour12 === 'boolean' ? obj.hour12 : null,
  };
}

export function savePrefs(storage: Storage, prefs: ClockPrefs): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota: the clocks still work, they are just not remembered.
  }
}

/**
 * A share link carries the zones in the fragment, readable as they are
 * ("#zones=Asia/Kolkata,America/New_York"), because the fragment is never sent
 * to the server and a person can see what they are about to open.
 */
export function encodeShare(zones: readonly string[]): string {
  return `#zones=${zones.map(encodeURIComponent).join(',')}`;
}

/** Zones from a share fragment, or null when the fragment is not one. */
export function decodeShare(hash: string): string[] | null {
  const match = /^#?zones=(.*)$/.exec(hash);
  if (!match) return null;
  const parts = match[1]!.split(',').map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return '';
    }
  });
  const zones = normalizeZones(parts, '');
  return zones.length && isValidZone(zones[0]) ? zones : null;
}
