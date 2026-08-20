import { createContext, useContext, type ParentProps } from 'solid-js';
import { LOCALES, DEFAULT_LOCALE, splitLocale, getLocale, type Locale, type LocaleCode } from './locales';
import { pathFor, type RouteKey } from './routes';
import { fmt, parts, type Part } from './format';
import type { Messages } from './messages/en';

/**
 * Client-side i18n.
 *
 * Locale message bundles are loaded ONE AT A TIME. `import.meta.glob` (lazy by
 * default) makes Vite emit a separate chunk per locale, so a visitor downloads
 * only their own language — with a dozen locales, statically importing them all
 * would put roughly 200 KB of other people's translations in everyone's bundle
 * and blow the landing budget (docs/05, `npm run budget`).
 *
 * The glob is also the single source of truth for which locales exist on the
 * client: a locale ships exactly when its file is present, which cannot drift
 * from the prerender's view of the same folder.
 */
const LOADERS = import.meta.glob('./messages/*.ts') as Record<
  string,
  () => Promise<{ default: Messages }>
>;

const key = (code: LocaleCode) => `./messages/${code}.ts`;

/** Locales with a translation file present, in the canonical LOCALES order. */
export const SHIPPED: Locale[] = LOCALES.filter((l) => key(l.code) in LOADERS);

export function isShipped(code: LocaleCode): boolean {
  return key(code) in LOADERS;
}

export async function loadMessages(code: LocaleCode): Promise<Messages> {
  const load = LOADERS[key(code)];
  if (!load) throw new Error(`No message bundle for locale "${code}"`);
  return (await load()).default;
}

/** The locale a URL belongs to, falling back to English for unshipped prefixes. */
export function localeFromPath(pathname: string): LocaleCode {
  const { locale } = splitLocale(pathname);
  return isShipped(locale) ? locale : DEFAULT_LOCALE;
}

export interface I18n {
  locale: LocaleCode;
  /** The active locale's messages. */
  m: Messages;
  /** Fill {tokens} in a message string. */
  fmt: (template: string, params?: Record<string, string | number>) => string;
  /** Split a message into literal chunks and token markers, for JSX embedding. */
  parts: (template: string) => Part[];
  /** The path of a route in the active locale. */
  path: (key: RouteKey) => string;
  dir: 'ltr' | 'rtl';
}

const Ctx = createContext<I18n>();

export function I18nProvider(props: ParentProps<{ locale: LocaleCode; messages: Messages }>) {
  const value: I18n = {
    locale: props.locale,
    m: props.messages,
    fmt,
    parts,
    path: (k) => pathFor(k, props.locale),
    dir: getLocale(props.locale).dir,
  };
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n used outside I18nProvider');
  return v;
}
