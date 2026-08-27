import { describe, it, expect } from 'vitest';
import { LOCALES, splitLocale, DEFAULT_LOCALE } from './locales';
import { ROUTES, TOOL_KEYS, pathFor, resolveRoute, alternatesFor, allPaths } from './routes';

describe('splitLocale', () => {
  it('treats an unprefixed path as the default locale', () => {
    expect(splitLocale('/compress-image-to-size')).toEqual({
      locale: 'en',
      rest: '/compress-image-to-size',
    });
  });

  it('extracts a known locale prefix', () => {
    expect(splitLocale('/es/comprimir-imagen')).toEqual({ locale: 'es', rest: '/comprimir-imagen' });
  });

  it('maps a bare locale prefix to the root path', () => {
    expect(splitLocale('/de')).toEqual({ locale: 'de', rest: '/' });
  });

  it('does not mistake a tool slug for a locale prefix', () => {
    expect(splitLocale('/passport-photo').locale).toBe('en');
  });
});

describe('pathFor', () => {
  it('keeps every English URL at the root, unchanged from before i18n', () => {
    expect(pathFor('home', 'en')).toBe('/');
    expect(pathFor('image-compress', 'en')).toBe('/compress-image-to-size');
    expect(pathFor('metadata-remove', 'en')).toBe('/remove-image-metadata');
    expect(pathFor('spreadsheet-compare', 'en')).toBe('/compare-spreadsheets');
    expect(pathFor('video-compress', 'en')).toBe('/compress-video-to-size');
    expect(pathFor('passport-photo', 'en')).toBe('/passport-photo');
    expect(pathFor('document-scan', 'en')).toBe('/scan-document');
    expect(pathFor('mouse-test', 'en')).toBe('/mouse-test');
    expect(pathFor('keyboard-test', 'en')).toBe('/keyboard-test');
    expect(pathFor('ruler', 'en')).toBe('/online-ruler');
    expect(pathFor('pdf-compress', 'en')).toBe('/compress-pdf-to-size');
    expect(pathFor('camera-mic-test', 'en')).toBe('/webcam-microphone-test');
    expect(pathFor('random-word', 'en')).toBe('/random-word-generator');
    expect(pathFor('pdf-merge', 'en')).toBe('/merge-pdf');
    expect(pathFor('screenshot-stitch', 'en')).toBe('/stitch-screenshots');
    expect(pathFor('about', 'en')).toBe('/about');
  });

  it('prefixes and translates the slug for other locales', () => {
    expect(pathFor('home', 'es')).toBe('/es');
    expect(pathFor('image-compress', 'de')).toBe('/de/bild-auf-groesse-komprimieren');
    expect(pathFor('passport-photo', 'tr')).toBe('/tr/vesikalik-fotograf');
  });

  it('serves the un-localized privacy policy at one URL for every locale', () => {
    for (const l of LOCALES) expect(pathFor('privacy', l.code)).toBe('/privacy');
  });
});

describe('resolveRoute', () => {
  it('round-trips every route in every locale', () => {
    for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      for (const l of LOCALES) {
        const path = pathFor(key, l.code);
        const hit = resolveRoute(path);
        expect(hit, `${key} @ ${l.code} -> ${path}`).not.toBeNull();
        expect(hit!.key).toBe(key);
        // Privacy is deliberately single-locale, so it always resolves as default.
        expect(hit!.locale).toBe(ROUTES[key].localized ? l.code : DEFAULT_LOCALE);
      }
    }
  });

  it('returns null for an unknown path', () => {
    expect(resolveRoute('/nope')).toBeNull();
    expect(resolveRoute('/es/nope')).toBeNull();
  });
});

describe('slug uniqueness', () => {
  it('never collides within a locale', () => {
    for (const l of LOCALES) {
      const paths = (Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((k) => pathFor(k, l.code));
      expect(new Set(paths).size, `duplicate path in ${l.code}`).toBe(paths.length);
    }
  });

  it('never lets a slug shadow a locale prefix', () => {
    const prefixes = new Set(LOCALES.map((l) => l.prefix).filter(Boolean));
    for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      for (const l of LOCALES) {
        const first = pathFor(key, l.code).split('/')[1] ?? '';
        if (l.code === DEFAULT_LOCALE && first) {
          expect(prefixes.has(first), `${key} shadows locale /${first}`).toBe(false);
        }
      }
    }
  });
});

describe('alternatesFor', () => {
  it('emits one hreflang per locale plus x-default for a localized route', () => {
    const alts = alternatesFor('image-compress');
    expect(alts).toHaveLength(LOCALES.length + 1);
    expect(alts.filter((a) => a.hreflang === 'x-default')).toHaveLength(1);
    expect(alts.find((a) => a.hreflang === 'x-default')!.href).toBe(
      'https://yappykit.com/compress-image-to-size',
    );
    expect(alts.find((a) => a.hreflang === 'es')!.href).toBe(
      'https://yappykit.com/es/comprimir-imagen-a-un-tamano',
    );
  });

  it('emits no alternates for an un-localized route', () => {
    expect(alternatesFor('privacy')).toEqual([]);
  });
});

describe('allPaths', () => {
  it('lists one entry per localized route per locale, plus one per single-locale page', () => {
    const localized = Object.values(ROUTES).filter((r) => r.localized).length;
    const singleLocale = Object.values(ROUTES).filter((r) => !r.localized).length;
    expect(allPaths()).toHaveLength(localized * LOCALES.length + singleLocale);
  });

  it('covers every tool', () => {
    expect(TOOL_KEYS).toHaveLength(14);
  });
});
