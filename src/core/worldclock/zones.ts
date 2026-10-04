/**
 * Which places a world clock can show, and how a person finds one.
 *
 * Two sources, deliberately layered. A curated list of about fifty cities is
 * what most people want and is searchable by the names they actually type
 * ("Bangalore", "San Francisco", "USA"). Behind it is every IANA zone the
 * browser knows, from Intl.supportedValuesOf, for the place the curated list
 * does not have. Nothing is fetched: the zone database ships inside the browser.
 *
 * ZONE NAMES ARE NOT STABLE ACROSS BROWSERS. IANA renames zones (Calcutta to
 * Kolkata, Kiev to Kyiv) and keeps the old name as a link, and engines disagree
 * about which one they report: V8 resolves "Asia/Kolkata" back to
 * "Asia/Calcutta", Firefox does the reverse. So two zones are compared by
 * `zoneKey`, never by string, or India appears twice in one list.
 */

export interface City {
  /** An IANA zone the browser accepts. Renamed zones use the modern name. */
  zone: string;
  /** English. Cities have no Intl display names; countries do. */
  city: string;
  /** ISO 3166 region, for Intl.DisplayNames. Absent for UTC. */
  country?: string;
  /** Other names people search for: nearby cities, the country, abbreviations. */
  aliases?: readonly string[];
}

export const CITIES: readonly City[] = [
  { zone: 'Asia/Kolkata', city: 'New Delhi', country: 'IN', aliases: ['India', 'Mumbai', 'Bengaluru', 'Bangalore', 'Chennai', 'Kolkata', 'Calcutta', 'Hyderabad', 'Pune', 'IST'] },
  { zone: 'America/New_York', city: 'New York', country: 'US', aliases: ['USA', 'United States', 'America', 'Washington', 'Boston', 'Miami', 'Atlanta', 'East Coast', 'Eastern', 'EST', 'EDT', 'ET'] },
  { zone: 'America/Chicago', city: 'Chicago', country: 'US', aliases: ['USA', 'Dallas', 'Houston', 'Austin', 'Central', 'CST', 'CDT', 'CT'] },
  { zone: 'America/Denver', city: 'Denver', country: 'US', aliases: ['USA', 'Salt Lake City', 'Mountain', 'MST', 'MDT', 'MT'] },
  { zone: 'America/Phoenix', city: 'Phoenix', country: 'US', aliases: ['USA', 'Arizona'] },
  { zone: 'America/Los_Angeles', city: 'Los Angeles', country: 'US', aliases: ['USA', 'San Francisco', 'Seattle', 'San Jose', 'Silicon Valley', 'West Coast', 'Pacific', 'PST', 'PDT', 'PT'] },
  { zone: 'America/Anchorage', city: 'Anchorage', country: 'US', aliases: ['USA', 'Alaska'] },
  { zone: 'Pacific/Honolulu', city: 'Honolulu', country: 'US', aliases: ['USA', 'Hawaii'] },
  { zone: 'America/Toronto', city: 'Toronto', country: 'CA', aliases: ['Canada', 'Ottawa', 'Montreal'] },
  { zone: 'America/Vancouver', city: 'Vancouver', country: 'CA', aliases: ['Canada'] },
  { zone: 'America/Mexico_City', city: 'Mexico City', country: 'MX', aliases: ['Mexico'] },
  { zone: 'America/Sao_Paulo', city: 'São Paulo', country: 'BR', aliases: ['Brazil', 'Rio de Janeiro', 'Brasilia'] },
  { zone: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', country: 'AR', aliases: ['Argentina'] },
  { zone: 'America/Bogota', city: 'Bogotá', country: 'CO', aliases: ['Colombia'] },
  { zone: 'America/Lima', city: 'Lima', country: 'PE', aliases: ['Peru'] },
  { zone: 'America/Santiago', city: 'Santiago', country: 'CL', aliases: ['Chile'] },
  { zone: 'Europe/London', city: 'London', country: 'GB', aliases: ['UK', 'United Kingdom', 'England', 'Britain', 'Manchester', 'Edinburgh', 'GMT', 'BST'] },
  { zone: 'Europe/Dublin', city: 'Dublin', country: 'IE', aliases: ['Ireland'] },
  { zone: 'Europe/Lisbon', city: 'Lisbon', country: 'PT', aliases: ['Portugal'] },
  { zone: 'Europe/Paris', city: 'Paris', country: 'FR', aliases: ['France', 'CET'] },
  { zone: 'Europe/Berlin', city: 'Berlin', country: 'DE', aliases: ['Germany', 'Munich', 'Frankfurt', 'Hamburg', 'CET'] },
  { zone: 'Europe/Madrid', city: 'Madrid', country: 'ES', aliases: ['Spain', 'Barcelona'] },
  { zone: 'Europe/Rome', city: 'Rome', country: 'IT', aliases: ['Italy', 'Milan'] },
  { zone: 'Europe/Amsterdam', city: 'Amsterdam', country: 'NL', aliases: ['Netherlands', 'Holland'] },
  { zone: 'Europe/Zurich', city: 'Zurich', country: 'CH', aliases: ['Switzerland', 'Geneva'] },
  { zone: 'Europe/Stockholm', city: 'Stockholm', country: 'SE', aliases: ['Sweden'] },
  { zone: 'Europe/Warsaw', city: 'Warsaw', country: 'PL', aliases: ['Poland'] },
  { zone: 'Europe/Athens', city: 'Athens', country: 'GR', aliases: ['Greece'] },
  { zone: 'Europe/Istanbul', city: 'Istanbul', country: 'TR', aliases: ['Turkey', 'Türkiye', 'Ankara'] },
  { zone: 'Europe/Kyiv', city: 'Kyiv', country: 'UA', aliases: ['Ukraine', 'Kiev'] },
  { zone: 'Europe/Moscow', city: 'Moscow', country: 'RU', aliases: ['Russia', 'Saint Petersburg'] },
  { zone: 'Africa/Cairo', city: 'Cairo', country: 'EG', aliases: ['Egypt'] },
  { zone: 'Africa/Lagos', city: 'Lagos', country: 'NG', aliases: ['Nigeria', 'Abuja'] },
  { zone: 'Africa/Nairobi', city: 'Nairobi', country: 'KE', aliases: ['Kenya'] },
  { zone: 'Africa/Johannesburg', city: 'Johannesburg', country: 'ZA', aliases: ['South Africa', 'Cape Town'] },
  { zone: 'Asia/Dubai', city: 'Dubai', country: 'AE', aliases: ['UAE', 'United Arab Emirates', 'Abu Dhabi'] },
  { zone: 'Asia/Riyadh', city: 'Riyadh', country: 'SA', aliases: ['Saudi Arabia', 'Jeddah'] },
  { zone: 'Asia/Tehran', city: 'Tehran', country: 'IR', aliases: ['Iran'] },
  { zone: 'Asia/Karachi', city: 'Karachi', country: 'PK', aliases: ['Pakistan', 'Lahore', 'Islamabad'] },
  { zone: 'Asia/Colombo', city: 'Colombo', country: 'LK', aliases: ['Sri Lanka'] },
  { zone: 'Asia/Kathmandu', city: 'Kathmandu', country: 'NP', aliases: ['Nepal'] },
  { zone: 'Asia/Dhaka', city: 'Dhaka', country: 'BD', aliases: ['Bangladesh'] },
  { zone: 'Asia/Bangkok', city: 'Bangkok', country: 'TH', aliases: ['Thailand'] },
  { zone: 'Asia/Jakarta', city: 'Jakarta', country: 'ID', aliases: ['Indonesia'] },
  { zone: 'Asia/Ho_Chi_Minh', city: 'Ho Chi Minh City', country: 'VN', aliases: ['Vietnam', 'Saigon', 'Hanoi'] },
  { zone: 'Asia/Singapore', city: 'Singapore', country: 'SG' },
  { zone: 'Asia/Kuala_Lumpur', city: 'Kuala Lumpur', country: 'MY', aliases: ['Malaysia'] },
  { zone: 'Asia/Manila', city: 'Manila', country: 'PH', aliases: ['Philippines'] },
  { zone: 'Asia/Shanghai', city: 'Beijing', country: 'CN', aliases: ['China', 'Shanghai', 'Shenzhen', 'Guangzhou'] },
  { zone: 'Asia/Hong_Kong', city: 'Hong Kong', country: 'HK' },
  { zone: 'Asia/Taipei', city: 'Taipei', country: 'TW', aliases: ['Taiwan'] },
  { zone: 'Asia/Seoul', city: 'Seoul', country: 'KR', aliases: ['Korea', 'South Korea'] },
  { zone: 'Asia/Tokyo', city: 'Tokyo', country: 'JP', aliases: ['Japan', 'Osaka'] },
  { zone: 'Australia/Perth', city: 'Perth', country: 'AU', aliases: ['Australia'] },
  { zone: 'Australia/Sydney', city: 'Sydney', country: 'AU', aliases: ['Australia', 'Melbourne', 'Canberra'] },
  { zone: 'Pacific/Auckland', city: 'Auckland', country: 'NZ', aliases: ['New Zealand', 'Wellington'] },
  { zone: 'UTC', city: 'UTC', aliases: ['GMT', 'Coordinated Universal Time', 'Zulu'] },
];

/**
 * Old IANA names that browsers still report, mapped to the current ones.
 *
 * Not the whole backward file: the renames a person is likely to meet, which
 * includes the zone their own device reports. Chrome on an Indian laptop says
 * "Asia/Calcutta", and showing that word to a user in 2026 reads as a bug.
 */
const MODERN: Readonly<Record<string, string>> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Ujung_Pandang': 'Asia/Makassar',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Etc/UTC': 'UTC',
  'Etc/GMT': 'UTC',
  'Etc/Universal': 'UTC',
  'Etc/Zulu': 'UTC',
  GMT: 'UTC',
  Universal: 'UTC',
  Zulu: 'UTC',
};

/** Whether the browser accepts this zone at all. */
export function isValidZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The name two spellings of one zone have in common, in its modern form.
 * Resolve first so the engine folds its own aliases, then apply ours so the
 * result does not depend on which engine did the folding.
 */
export function zoneKey(zone: string): string {
  let resolved = zone;
  try {
    resolved = new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    // Not a zone this browser knows; keyed as written so it still dedupes.
  }
  return MODERN[resolved] ?? MODERN[zone] ?? resolved;
}

/** The zone this device is set to, which is where the clock starts. */
export function deviceZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidZone(zone)) return zoneKey(zone);
  } catch {
    // Fall through: a browser that cannot say is treated as UTC, not as broken.
  }
  return 'UTC';
}

const BY_KEY = new Map<string, City>();
for (const c of CITIES) BY_KEY.set(zoneKey(c.zone), c);

/** "America/Argentina/Buenos_Aires" reads as "Buenos Aires". */
export function cityFromZone(zone: string): string {
  const key = zoneKey(zone);
  return key.slice(key.lastIndexOf('/') + 1).replace(/_/g, ' ');
}

/**
 * How a zone is labelled wherever it appears: the curated city when there is
 * one, otherwise the place the zone is named after.
 */
export function describeZone(zone: string): City {
  const key = zoneKey(zone);
  return BY_KEY.get(key) ?? { zone: key, city: cityFromZone(key) };
}

/**
 * Every zone the browser can show, modern names, curated ones first.
 * Returns the curated list alone where Intl.supportedValuesOf is missing,
 * which the tool declares as a preferred capability and says so on the page.
 */
export function allZones(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (z: string) => {
    if (!isValidZone(z)) return;
    const key = zoneKey(z);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  CITIES.forEach((c) => add(c.zone));
  const list = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (typeof list === 'function') list('timeZone').forEach(add);
  return out;
}

/** Lowercased with accents dropped, so "sao paulo" finds São Paulo. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function zoneName(zone: string, locale: string, style: 'long' | 'short' | 'longGeneric'): string {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
}

export function countryName(code: string | undefined, locale: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The zone's own name in the reader's language: "India Standard Time". */
export const genericZoneName = (zone: string, locale: string) => zoneName(zone, locale, 'longGeneric');

export interface ZoneMatch {
  zone: string;
  city: string;
  country: string;
  curated: boolean;
}

/**
 * Search haystack per zone, built once per locale. Building one means a few
 * hundred Intl formatters, which is a noticeable pause on a slow phone if it
 * happens on every keystroke rather than once.
 */
const HAYSTACKS = new Map<string, { match: ZoneMatch; names: string[] }[]>();

function haystack(locale: string) {
  const cached = HAYSTACKS.get(locale);
  if (cached) return cached;
  const built = allZones().map((zone) => {
    const c = BY_KEY.get(zone);
    const country = countryName(c?.country, locale);
    const names = [
      c?.city ?? cityFromZone(zone),
      zone.replace(/_/g, ' '),
      country,
      countryName(c?.country, 'en'),
      ...(c?.aliases ?? []),
      zoneName(zone, 'en-US', 'longGeneric'),
      zoneName(zone, 'en-US', 'short'),
      zoneName(zone, locale, 'longGeneric'),
    ]
      .filter(Boolean)
      .map(fold);
    return { match: { zone, city: c?.city ?? cityFromZone(zone), country, curated: !!c }, names };
  });
  HAYSTACKS.set(locale, built);
  return built;
}

/**
 * Zones matching what someone typed. A name that STARTS with the query beats
 * one that merely contains it, and a curated city beats a raw zone at the same
 * strength, so "par" offers Paris before Paramaribo.
 */
export function searchZones(query: string, locale: string, limit = 12): ZoneMatch[] {
  const q = fold(query);
  if (!q) return [];
  const scored: { match: ZoneMatch; score: number }[] = [];
  for (const { match, names } of haystack(locale)) {
    let best = 0;
    for (const name of names) {
      if (name === q) best = Math.max(best, 4);
      else if (name.startsWith(q) || name.includes(` ${q}`) || name.includes(`/${q}`)) best = Math.max(best, 3);
      else if (name.includes(q)) best = Math.max(best, 1);
    }
    if (best) scored.push({ match, score: best * 2 + (match.curated ? 1 : 0) });
  }
  // A match in the middle of a word ("usa" inside Lusaka) is only worth
  // offering when nothing matched properly.
  const strong = scored.some((s) => s.score >= 6);
  return scored
    .filter((s) => !strong || s.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.match);
}
