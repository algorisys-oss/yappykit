/**
 * The locale table — one source of truth for routing, hreflang, prerendering and
 * the language switcher.
 *
 * English is served at the root (no prefix) so every URL that is already indexed
 * keeps working; every other locale lives under a short prefix. See
 * docs/06-seo-content-strategy.md.
 */

export type LocaleCode =
  | 'en' | 'es' | 'pt-BR' | 'id' | 'fr' | 'de'
  | 'ru' | 'ja' | 'ar' | 'tr' | 'vi' | 'it';

export interface Locale {
  /** BCP-47 tag. Also the hreflang value and the <html lang> value. */
  code: LocaleCode;
  /** URL path segment. Empty for English, which is served at the root. */
  prefix: string;
  /** Endonym — how speakers name their own language, for the switcher. */
  name: string;
  /** Writing direction, for <html dir>. */
  dir: 'ltr' | 'rtl';
  /** Open Graph locale (og:locale uses underscores, not hyphens). */
  ogLocale: string;
}

export const LOCALES: Locale[] = [
  { code: 'en',    prefix: '',   name: 'English',          dir: 'ltr', ogLocale: 'en_US' },
  { code: 'es',    prefix: 'es', name: 'Español',          dir: 'ltr', ogLocale: 'es_ES' },
  { code: 'pt-BR', prefix: 'pt', name: 'Português (BR)',   dir: 'ltr', ogLocale: 'pt_BR' },
  { code: 'id',    prefix: 'id', name: 'Bahasa Indonesia', dir: 'ltr', ogLocale: 'id_ID' },
  { code: 'fr',    prefix: 'fr', name: 'Français',         dir: 'ltr', ogLocale: 'fr_FR' },
  { code: 'de',    prefix: 'de', name: 'Deutsch',          dir: 'ltr', ogLocale: 'de_DE' },
  { code: 'ru',    prefix: 'ru', name: 'Русский',          dir: 'ltr', ogLocale: 'ru_RU' },
  { code: 'ja',    prefix: 'ja', name: '日本語',            dir: 'ltr', ogLocale: 'ja_JP' },
  { code: 'ar',    prefix: 'ar', name: 'العربية',           dir: 'rtl', ogLocale: 'ar_AR' },
  { code: 'tr',    prefix: 'tr', name: 'Türkçe',           dir: 'ltr', ogLocale: 'tr_TR' },
  { code: 'vi',    prefix: 'vi', name: 'Tiếng Việt',       dir: 'ltr', ogLocale: 'vi_VN' },
  { code: 'it',    prefix: 'it', name: 'Italiano',         dir: 'ltr', ogLocale: 'it_IT' },
];

export const DEFAULT_LOCALE: LocaleCode = 'en';

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
const BY_PREFIX = new Map(LOCALES.filter((l) => l.prefix).map((l) => [l.prefix, l]));

export function getLocale(code: LocaleCode): Locale {
  const l = BY_CODE.get(code);
  if (!l) throw new Error(`Unknown locale: ${code}`);
  return l;
}

/**
 * Split a pathname into its locale and the remaining path.
 * `/es/comprimir-imagen` → { locale: 'es', rest: '/comprimir-imagen' }
 * `/compress-image`      → { locale: 'en', rest: '/compress-image' }
 */
export function splitLocale(pathname: string): { locale: LocaleCode; rest: string } {
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const hit = m ? BY_PREFIX.get(m[1]!) : undefined;
  if (!hit) return { locale: DEFAULT_LOCALE, rest: pathname };
  return { locale: hit.code, rest: m![2] ?? '/' };
}
