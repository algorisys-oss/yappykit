import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, MAX_MESSAGE_CHARS,
  normalizeSettings, truncateGraphemes, loadSettings, saveSettings, clearSettings,
} from './settings';

function storage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

describe('normalizing', () => {
  it('fills every missing field from the defaults', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps values that are already valid', () => {
    const s = normalizeSettings({ headline: 'Back soon', bellVolume: 0.4, fontScale: 1.5 });
    expect(s.headline).toBe('Back soon');
    expect(s.bellVolume).toBe(0.4);
    expect(s.fontScale).toBe(1.5);
  });

  it('clamps volume and font scale into range', () => {
    expect(normalizeSettings({ bellVolume: 9 }).bellVolume).toBe(1);
    expect(normalizeSettings({ bellVolume: -3 }).bellVolume).toBe(0);
    expect(normalizeSettings({ fontScale: 99 }).fontScale).toBe(2);
    expect(normalizeSettings({ fontScale: 0.01 }).fontScale).toBe(0.5);
  });

  it('rejects anything that is not a six-digit hex colour', () => {
    expect(normalizeSettings({ background: 'red' }).background).toBe(DEFAULT_SETTINGS.background);
    expect(normalizeSettings({ background: '#ab' }).background).toBe(DEFAULT_SETTINGS.background);
    expect(normalizeSettings({ textColor: '#00B140' }).textColor).toBe('#00b140');
  });

  it('rejects a duration outside what the countdown supports', () => {
    expect(normalizeSettings({ durationMs: -1 }).durationMs).toBe(1_000);
    expect(normalizeSettings({ durationMs: 999_999_999 }).durationMs).toBe(24 * 60 * 60 * 1000);
  });

  it('coerces the wrong type rather than trusting it', () => {
    expect(normalizeSettings({ headline: 42 as unknown as string }).headline).toBe(DEFAULT_SETTINGS.headline);
    expect(normalizeSettings({ bellEnabled: 'yes' as unknown as boolean }).bellEnabled).toBe(DEFAULT_SETTINGS.bellEnabled);
    expect(normalizeSettings({ confettiEnabled: 1 as unknown as boolean }).confettiEnabled).toBe(DEFAULT_SETTINGS.confettiEnabled);
  });

  it('keeps a confetti flag that was deliberately turned off', () => {
    expect(normalizeSettings({ confettiEnabled: false }).confettiEnabled).toBe(false);
  });
});

describe('message length', () => {
  it('caps a long message', () => {
    const s = normalizeSettings({ headline: 'a'.repeat(500) });
    expect(s.headline).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it('counts an emoji as one character, not as its code units', () => {
    expect(truncateGraphemes('🎉🎉🎉', 2)).toBe('🎉🎉');
  });

  it('never splits an emoji in half', () => {
    // A family emoji is several code points joined by zero-width joiners:
    // slicing by code unit produces mojibake or a stray joiner.
    const family = '👨‍👩‍👧‍👦';
    expect(truncateGraphemes(family + 'x', 1)).toBe(family);
    expect(truncateGraphemes(family, 1)).toBe(family);
  });

  it('keeps a flag whole', () => {
    expect(truncateGraphemes('🇮🇳🇯🇵', 1)).toBe('🇮🇳');
  });

  it('leaves a short string untouched', () => {
    expect(truncateGraphemes('Back in 5', 50)).toBe('Back in 5');
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const s = storage();
    const saved = normalizeSettings({ headline: 'Starting soon 🎬', durationMs: 300_000 });
    saveSettings(s, saved);
    expect(loadSettings(s)).toEqual(saved);
  });

  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings(storage())).toEqual(DEFAULT_SETTINGS);
  });

  it('returns the defaults rather than throwing on corrupt storage', () => {
    expect(loadSettings(storage({ 'yappykit-stream-timer': 'not json{' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs a partial or tampered record instead of trusting it', () => {
    const s = storage({ 'yappykit-stream-timer': JSON.stringify({ headline: 'Hi', bellVolume: 50 }) });
    const loaded = loadSettings(s);
    expect(loaded.headline).toBe('Hi');
    expect(loaded.bellVolume).toBe(1);
    expect(loaded.background).toBe(DEFAULT_SETTINGS.background);
  });

  it('survives storage that throws, as it does in private mode', () => {
    const hostile = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(loadSettings(hostile)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(hostile, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => clearSettings(hostile)).not.toThrow();
  });

  it('forgets the saved settings on clear', () => {
    const s = storage();
    saveSettings(s, normalizeSettings({ headline: 'Hi' }));
    clearSettings(s);
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
