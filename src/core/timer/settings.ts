/**
 * Everything the display shows besides the clock: the message, its colours, and
 * the bell preferences. Persisted, because a streamer sets this up once and
 * wants it there next time.
 *
 * `normalizeSettings` is the only way to build one. Settings arrive from
 * localStorage and from another window over BroadcastChannel, so nothing here
 * may assume a field is present or even the right type: everything is checked
 * and repaired against the defaults rather than trusted.
 */
import { clampDuration } from './countdown';

export interface TimerSettings {
  headline: string;
  subline: string;
  durationMs: number;
  /** Display background. Set it to your key colour to chroma it out in OBS. */
  background: string;
  textColor: string;
  /** Multiplier on the display type size, so the clock fits the scene. */
  fontScale: number;
  bellEnabled: boolean;
  bellVolume: number;
  /** Throw confetti when the countdown reaches zero. */
  confettiEnabled: boolean;
  /** Output device for the bell. Empty means the system default. */
  sinkId: string;
}

export const MAX_MESSAGE_CHARS = 120;
export const MIN_FONT_SCALE = 0.5;
export const MAX_FONT_SCALE = 2;

/** A key colour is a deliberate choice, so the default is simply the dark scene. */
export const DEFAULT_SETTINGS: TimerSettings = {
  headline: 'Back in a moment',
  subline: '',
  durationMs: 5 * 60 * 1000,
  background: '#0b1220',
  textColor: '#f8fafc',
  fontScale: 1,
  bellEnabled: true,
  bellVolume: 0.6,
  confettiEnabled: true,
  sinkId: '',
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Cut a string to `max` USER-PERCEIVED characters.
 *
 * Emoji are the whole reason this is not `slice`. A flag is two code points, a
 * family is four joined by zero-width joiners, and a skin-toned wave is two:
 * cutting by code unit lands inside one and leaves a broken glyph or a stray
 * joiner on screen. Intl.Segmenter knows where the boundaries are; where it is
 * missing, code points are still a far better guess than code units.
 */
export function truncateGraphemes(text: string, max: number): string {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Segmenter) return Array.from(text).slice(0, max).join('');

  const out: string[] = [];
  for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (out.length === max) break;
    out.push(segment);
  }
  return out.join('');
}

const text = (v: unknown, fallback: string) =>
  typeof v === 'string' ? truncateGraphemes(v, MAX_MESSAGE_CHARS) : fallback;

const colour = (v: unknown, fallback: string) =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;

const number = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

export function normalizeSettings(input: unknown): TimerSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    headline: text(raw.headline, d.headline),
    subline: text(raw.subline, d.subline),
    durationMs: typeof raw.durationMs === 'number' ? clampDuration(raw.durationMs) : d.durationMs,
    background: colour(raw.background, d.background),
    textColor: colour(raw.textColor, d.textColor),
    fontScale: number(raw.fontScale, d.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE),
    bellEnabled: flag(raw.bellEnabled, d.bellEnabled),
    bellVolume: number(raw.bellVolume, d.bellVolume, 0, 1),
    confettiEnabled: flag(raw.confettiEnabled, d.confettiEnabled),
    sinkId: typeof raw.sinkId === 'string' ? raw.sinkId : d.sinkId,
  };
}

const STORAGE_KEY = 'yappykit-stream-timer';

/**
 * Storage access is wrapped because it genuinely throws: Safari private mode
 * and a browser set to block site data both reject getItem outright. Losing a
 * saved message is a shrug; taking the tool down with it is not.
 */
export function loadSettings(storage: Pick<Storage, 'getItem'>): TimerSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? { ...DEFAULT_SETTINGS } : normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: TimerSettings): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Nothing to do and nothing worth telling the user: the tool works either way. */
  }
}

export function clearSettings(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* As above. */
  }
}
