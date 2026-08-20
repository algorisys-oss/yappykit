/**
 * Every SHIPPED locale's messages, eagerly imported.
 *
 * This module is for the prerender SSR build ONLY — never import it from client
 * code, or every locale's copy lands in every visitor's bundle. The client
 * loads exactly one locale via the dynamic import in ./runtime.tsx.
 *
 * It lives OUTSIDE messages/ on purpose: the client discovers locales with
 * `import.meta.glob('./messages/*.ts')`, and a registry sitting in that folder
 * would be globbed as though it were a locale.
 *
 * A locale appears here only once its translation is complete. `SHIPPED_LOCALES`
 * is derived from these keys and is what drives prerendering, the sitemap, the
 * hreflang cluster and the language switcher — so a locale that is not fully
 * translated is never advertised to Google as an alternate, and there is no way
 * to accidentally publish an English page at a translated URL.
 */
import { LOCALES, type LocaleCode, type Locale } from './locales';
import type { Messages } from './messages/en';
import en from './messages/en';
import es from './messages/es';
import ptBR from './messages/pt-BR';
import id from './messages/id';
import fr from './messages/fr';
import de from './messages/de';
import ru from './messages/ru';
import ja from './messages/ja';
import ar from './messages/ar';
import tr from './messages/tr';
import vi from './messages/vi';
import it from './messages/it';

export const MESSAGES: Partial<Record<LocaleCode, Messages>> = {
  en,
  es,
  'pt-BR': ptBR,
  id,
  fr,
  de,
  ru,
  ja,
  ar,
  tr,
  vi,
  it,
};

/** The locales that actually have a complete translation, in LOCALES order. */
export const SHIPPED_LOCALES: Locale[] = LOCALES.filter((l) => MESSAGES[l.code] !== undefined);

export function messagesFor(code: LocaleCode): Messages {
  const m = MESSAGES[code];
  if (!m) throw new Error(`No messages for locale ${code}`);
  return m;
}
