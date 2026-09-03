/**
 * The route table — every page, with its slug in every locale.
 *
 * This is the single source of truth for the Solid router, the language
 * switcher, the hreflang alternates and the generated sitemap. Adding a page or
 * a locale means editing this table and nothing else.
 *
 * SLUG POLICY: translated, keyword-bearing slugs for the Latin-script locales,
 * because the keyword in the URL is a real signal for the exact-intent long-tail
 * queries we target (docs/06). Russian is transliterated rather than Cyrillic —
 * a percent-encoded URL is hostile to share and copy. Japanese and Arabic keep
 * the English slug, which is what the established tool sites do and what their
 * users expect to see in an address bar.
 */
import { LOCALES, DEFAULT_LOCALE, type Locale, type LocaleCode, splitLocale } from './locales';

export const TOOL_KEYS = [
  'image-compress',
  'metadata-remove',
  'spreadsheet-compare',
  'video-compress',
  'passport-photo',
  'document-scan',
  'mouse-test',
  'keyboard-test',
  'ruler',
  'pdf-compress',
  'camera-mic-test',
  'random-word',
  'pdf-merge',
  'screenshot-stitch',
  'font-coverage',
  'font-style',
  'image-to-pdf',
] as const;

export type ToolKey = (typeof TOOL_KEYS)[number];
export type RouteKey = ToolKey | 'home' | 'about' | 'privacy' | 'terms';

export interface RouteDef {
  /**
   * Slug per locale. `en` is required; a missing locale falls back to it.
   * The home route uses '' — it is the locale root.
   */
  slugs: { en: string } & Partial<Record<LocaleCode, string>>;
  /**
   * Whether this page exists per locale. The Privacy Policy is deliberately
   * English-only and served at one URL: a machine-translated legal document is
   * a liability, not an asset, and duplicating it across 12 locales would be
   * both. It therefore emits no hreflang alternates.
   */
  localized: boolean;
}

export const ROUTES: Record<RouteKey, RouteDef> = {
  home: {
    localized: true,
    slugs: { en: '' },
  },
  'image-compress': {
    localized: true,
    slugs: {
      en: 'compress-image-to-size',
      es: 'comprimir-imagen-a-un-tamano',
      'pt-BR': 'comprimir-imagem-para-tamanho',
      id: 'kompres-gambar-ke-ukuran',
      fr: 'compresser-une-image-a-une-taille',
      de: 'bild-auf-groesse-komprimieren',
      ru: 'szhat-izobrazhenie-do-razmera',
      tr: 'resmi-boyuta-sikistir',
      vi: 'nen-anh-theo-kich-thuoc',
      it: 'comprimere-immagine-a-dimensione',
    },
  },
  'metadata-remove': {
    localized: true,
    slugs: {
      en: 'remove-image-metadata',
      es: 'eliminar-metadatos-de-fotos',
      'pt-BR': 'remover-metadados-de-imagem',
      id: 'hapus-metadata-foto',
      fr: 'supprimer-les-metadonnees-photo',
      de: 'bild-metadaten-entfernen',
      ru: 'udalit-metadannye-foto',
      tr: 'fotograf-meta-verisini-kaldir',
      vi: 'xoa-metadata-anh',
      it: 'rimuovere-metadati-immagine',
    },
  },
  'spreadsheet-compare': {
    localized: true,
    slugs: {
      en: 'compare-spreadsheets',
      es: 'comparar-hojas-de-calculo',
      'pt-BR': 'comparar-planilhas',
      id: 'bandingkan-spreadsheet',
      fr: 'comparer-des-feuilles-de-calcul',
      de: 'tabellen-vergleichen',
      ru: 'sravnit-tablitsy',
      tr: 'elektronik-tablolari-karsilastir',
      vi: 'so-sanh-bang-tinh',
      it: 'confrontare-fogli-di-calcolo',
    },
  },
  'video-compress': {
    localized: true,
    slugs: {
      en: 'compress-video-to-size',
      es: 'comprimir-video-a-un-tamano',
      'pt-BR': 'comprimir-video-para-tamanho',
      id: 'kompres-video-ke-ukuran',
      fr: 'compresser-une-video-a-une-taille',
      de: 'video-auf-groesse-komprimieren',
      ru: 'szhat-video-do-razmera',
      tr: 'videoyu-boyuta-sikistir',
      vi: 'nen-video-theo-kich-thuoc',
      it: 'comprimere-video-a-dimensione',
    },
  },
  'passport-photo': {
    localized: true,
    slugs: {
      en: 'passport-photo',
      es: 'foto-de-pasaporte',
      'pt-BR': 'foto-de-passaporte',
      id: 'pas-foto',
      fr: 'photo-d-identite',
      de: 'passfoto',
      ru: 'foto-na-pasport',
      tr: 'vesikalik-fotograf',
      vi: 'anh-the-ho-chieu',
      it: 'foto-tessera',
    },
  },
  'document-scan': {
    localized: true,
    slugs: {
      en: 'scan-document',
      es: 'escanear-documento',
      'pt-BR': 'digitalizar-documento',
      id: 'pindai-dokumen',
      fr: 'scanner-un-document',
      de: 'dokument-scannen',
      ru: 'skanirovat-dokument',
      tr: 'belge-tara',
      vi: 'quet-tai-lieu',
      it: 'scansionare-documento',
    },
  },
  'mouse-test': {
    localized: true,
    slugs: {
      en: 'mouse-test',
      es: 'test-de-raton',
      'pt-BR': 'teste-de-mouse',
      id: 'tes-mouse',
      fr: 'test-de-souris',
      de: 'maus-test',
      ru: 'test-myshi',
      tr: 'fare-testi',
      vi: 'kiem-tra-chuot',
      it: 'test-del-mouse',
    },
  },
  'keyboard-test': {
    localized: true,
    slugs: {
      en: 'keyboard-test',
      es: 'test-de-teclado',
      'pt-BR': 'teste-de-teclado',
      id: 'tes-keyboard',
      fr: 'test-de-clavier',
      de: 'tastatur-test',
      ru: 'test-klaviatury',
      tr: 'klavye-testi',
      vi: 'kiem-tra-ban-phim',
      it: 'test-tastiera',
    },
  },
  ruler: {
    localized: true,
    slugs: {
      en: 'online-ruler',
      es: 'regla-online',
      'pt-BR': 'regua-online',
      id: 'penggaris-online',
      fr: 'regle-en-ligne',
      de: 'lineal-online',
      ru: 'linejka-onlajn',
      tr: 'online-cetvel',
      vi: 'thuoc-ke-online',
      it: 'righello-online',
    },
  },
  'pdf-compress': {
    localized: true,
    slugs: {
      en: 'compress-pdf-to-size',
      es: 'comprimir-pdf-a-un-tamano',
      'pt-BR': 'comprimir-pdf-para-tamanho',
      id: 'kompres-pdf-ke-ukuran',
      fr: 'compresser-un-pdf-a-une-taille',
      de: 'pdf-auf-groesse-komprimieren',
      ru: 'szhat-pdf-do-razmera',
      tr: 'pdf-boyutunu-kucult',
      vi: 'nen-pdf-theo-kich-thuoc',
      it: 'comprimere-pdf-a-dimensione',
    },
  },
  'camera-mic-test': {
    localized: true,
    slugs: {
      en: 'webcam-microphone-test',
      es: 'test-de-camara-y-microfono',
      'pt-BR': 'teste-de-webcam-e-microfone',
      id: 'tes-kamera-dan-mikrofon',
      fr: 'test-camera-et-microphone',
      de: 'webcam-mikrofon-test',
      ru: 'test-kamery-i-mikrofona',
      tr: 'kamera-ve-mikrofon-testi',
      vi: 'kiem-tra-webcam-va-micro',
      it: 'test-webcam-e-microfono',
    },
  },
  'random-word': {
    localized: true,
    slugs: {
      en: 'random-word-generator',
      es: 'generador-de-palabras-aleatorias',
      'pt-BR': 'gerador-de-palavras-aleatorias',
      id: 'generator-kata-acak',
      fr: 'generateur-de-mots-aleatoires',
      de: 'zufallswortgenerator',
      ru: 'generator-sluchaynyh-slov',
      tr: 'rastgele-kelime-uretici',
      vi: 'tao-tu-ngau-nhien',
      it: 'generatore-di-parole-casuali',
    },
  },
  'pdf-merge': {
    localized: true,
    slugs: {
      en: 'merge-pdf',
      es: 'unir-pdf',
      'pt-BR': 'juntar-pdf',
      id: 'gabungkan-pdf',
      fr: 'fusionner-pdf',
      de: 'pdf-zusammenfuegen',
      ru: 'obedinit-pdf',
      tr: 'pdf-birlestir',
      vi: 'gop-pdf',
      it: 'unire-pdf',
    },
  },
  'screenshot-stitch': {
    localized: true,
    slugs: {
      en: 'stitch-screenshots',
      es: 'unir-capturas-de-pantalla',
      'pt-BR': 'juntar-capturas-de-tela',
      id: 'gabungkan-tangkapan-layar',
      fr: 'assembler-des-captures-decran',
      de: 'screenshots-zusammenfuegen',
      ru: 'obedinit-skrinshoty',
      tr: 'ekran-goruntusu-birlestirme',
      vi: 'ghep-anh-chup-man-hinh',
      it: 'unire-screenshot',
    },
  },
  'font-coverage': {
    localized: true,
    slugs: {
      en: 'font-character-checker',
      es: 'comprobar-caracteres-de-fuente',
      'pt-BR': 'verificar-caracteres-da-fonte',
      id: 'cek-karakter-font',
      fr: 'verifier-les-caracteres-d-une-police',
      de: 'schriftart-zeichen-pruefen',
      ru: 'proverit-simvoly-shrifta',
      tr: 'font-karakter-denetleyici',
      vi: 'kiem-tra-ky-tu-phong-chu',
      it: 'verificare-caratteri-del-font',
    },
  },
  'font-style': {
    localized: true,
    slugs: {
      en: 'font-style-finder',
      es: 'encontrar-fuente-por-estilo',
      'pt-BR': 'encontrar-fonte-por-estilo',
      id: 'cari-font-berdasarkan-gaya',
      fr: 'trouver-une-police-par-style',
      de: 'schriftart-nach-stil-finden',
      ru: 'podobrat-shrift-po-stilyu',
      tr: 'stile-gore-font-bul',
      vi: 'tim-phong-chu-theo-phong-cach',
      it: 'trovare-font-per-stile',
    },
  },
  'image-to-pdf': {
    localized: true,
    slugs: {
      en: 'image-to-pdf',
      es: 'imagen-a-pdf',
      'pt-BR': 'imagem-para-pdf',
      id: 'gambar-ke-pdf',
      fr: 'image-en-pdf',
      de: 'bild-in-pdf-umwandeln',
      ru: 'izobrazhenie-v-pdf',
      tr: 'resimden-pdf-olustur',
      vi: 'chuyen-anh-sang-pdf',
      it: 'immagine-in-pdf',
    },
  },
  about: {
    localized: true,
    slugs: {
      en: 'about',
      es: 'sobre-nosotros',
      'pt-BR': 'sobre',
      id: 'tentang',
      fr: 'a-propos',
      de: 'ueber-uns',
      ru: 'o-nas',
      tr: 'hakkinda',
      vi: 'gioi-thieu',
      it: 'chi-siamo',
    },
  },
  privacy: {
    localized: false,
    slugs: { en: 'privacy' },
  },
  terms: {
    // Single-locale for the same reason as the privacy policy: a
    // machine-translated liability disclaimer is worse than no translation.
    localized: false,
    slugs: { en: 'terms' },
  },
};

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

export const SITE = 'https://yappykit.com';

/** The slug for a route in a locale, falling back to English. */
export function slugFor(key: RouteKey, locale: LocaleCode): string {
  const def = ROUTES[key];
  if (!def.localized) return def.slugs.en;
  return def.slugs[locale] ?? def.slugs.en;
}

/** The absolute path for a route in a locale. Never has a trailing slash (except '/'). */
export function pathFor(key: RouteKey, locale: LocaleCode): string {
  const def = ROUTES[key];
  const effective = def.localized ? locale : DEFAULT_LOCALE;
  return pathWithSlug(effective, slugFor(key, effective));
}

/** A locale's path for any slug, including one we have stopped serving. */
function pathWithSlug(locale: LocaleCode, slug: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${localePrefix(locale)}`;
  if (!slug) return prefix || '/';
  return `${prefix}/${slug}`;
}

/** The full canonical URL for a route in a locale. */
export function urlFor(key: RouteKey, locale: LocaleCode): string {
  return SITE + pathFor(key, locale);
}

function localePrefix(code: LocaleCode): string {
  const l = LOCALES.find((x) => x.code === code);
  if (!l) throw new Error(`Unknown locale: ${code}`);
  return l.prefix;
}

/** Reverse of `pathFor`. Returns null when the path matches no known route. */
export function resolveRoute(pathname: string): { key: RouteKey; locale: LocaleCode } | null {
  const clean = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  const { locale, rest } = splitLocale(clean);
  const slug = rest === '/' ? '' : rest.slice(1);

  for (const key of ROUTE_KEYS) {
    const def = ROUTES[key];
    // An un-localized route only exists at its English URL.
    if (!def.localized) {
      if (locale === DEFAULT_LOCALE && slug === def.slugs.en) return { key, locale: DEFAULT_LOCALE };
      continue;
    }
    if (slugFor(key, locale) === slug) return { key, locale };
  }
  return null;
}

/**
 * Slugs we have served and no longer serve.
 *
 * ROUTES only knows the URL a page has now, so a rename quietly turns
 * yesterday's URL into a 404 for anyone holding the link, and there is nothing
 * left in the table to notice. These rows are what `_redirects` is generated
 * from, so the redirect cannot drift from the rename that caused it.
 *
 * Only add a row for a slug that actually shipped. A slug changed before it was
 * deployed never existed and needs no redirect.
 */
const RETIRED: { key: ToolKey; slugs: { en: string } & Partial<Record<LocaleCode, string>> }[] = [
  {
    // Shipped as "font finder", renamed within the day. The generic term is
    // mostly people wanting a typeface identified from a screenshot, which this
    // tool deliberately does not do, so it would have earned clicks that bounce.
    // docs/06: head terms are not the target.
    key: 'font-coverage',
    slugs: {
      en: 'font-finder',
      es: 'buscador-de-fuentes',
      'pt-BR': 'localizador-de-fontes',
      id: 'pencari-font',
      fr: 'trouver-une-police',
      de: 'schriftart-finden',
      ru: 'podobrat-shrift',
      tr: 'font-bulucu',
      vi: 'tim-phong-chu',
      it: 'trova-font',
    },
  },
];

export interface Redirect {
  from: string;
  to: string;
}

/**
 * Every retired URL and where it lives now.
 *
 * Built with the same per-locale fallback the old paths were built with, so a
 * locale that served the English slug then gets a redirect from the English
 * slug now.
 */
export function redirects(locales: readonly Locale[] = LOCALES): Redirect[] {
  const out: Redirect[] = [];
  for (const retired of RETIRED) {
    for (const l of locales) {
      const from = pathWithSlug(l.code, retired.slugs[l.code] ?? retired.slugs.en);
      const to = pathFor(retired.key, l.code);
      // A locale whose slug did not change would otherwise redirect to itself.
      if (from !== to) out.push({ from, to });
    }
  }
  return out;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

/**
 * hreflang alternates for a route: one per locale plus `x-default` pointing at
 * English. Google requires every alternate set to be reciprocal and to include
 * the page itself, which emitting from this single table guarantees.
 */
export function alternatesFor(key: RouteKey, locales: readonly Locale[] = LOCALES): Alternate[] {
  if (!ROUTES[key].localized) return [];
  const alts: Alternate[] = locales.map((l) => ({
    hreflang: l.code,
    href: urlFor(key, l.code),
  }));
  alts.push({ hreflang: 'x-default', href: urlFor(key, DEFAULT_LOCALE) });
  return alts;
}

/** Every page the site serves — the input to prerendering and the sitemap. */
export function allPaths(
  locales: readonly Locale[] = LOCALES,
): { key: RouteKey; locale: LocaleCode; path: string }[] {
  const out: { key: RouteKey; locale: LocaleCode; path: string }[] = [];
  for (const key of ROUTE_KEYS) {
    if (!ROUTES[key].localized) {
      out.push({ key, locale: DEFAULT_LOCALE, path: pathFor(key, DEFAULT_LOCALE) });
      continue;
    }
    for (const l of locales) out.push({ key, locale: l.code, path: pathFor(key, l.code) });
  }
  return out;
}

/**
 * The three tools cross-linked from a tool page.
 *
 * Hand-written by topic, because the link and its anchor text are a relevance
 * signal and the previous version threw that away: it walked TOOL_KEYS
 * cyclically, so /merge-pdf pointed at the screenshot stitcher and the metadata
 * remover and never once at /compress-pdf-to-size. Connected, but telling a
 * crawler nothing about what either page is about.
 *
 * What the cyclic walk did buy was the guarantee that no tool is ever orphaned,
 * and that survives here two ways: the same walk still pads a list shorter than
 * `count`, so a tool added to TOOL_KEYS and forgotten here still links out; and
 * routes.test.ts asserts that every tool is linked TO from at least one other,
 * which is the half a fallback cannot cover. Add a tool, and that test tells you
 * to wire it into a cluster rather than leaving it stranded.
 *
 * docs/06 asks for 3-5 related links on every tool page.
 */
const RELATED: Record<ToolKey, readonly ToolKey[]> = {
  'image-compress': ['metadata-remove', 'passport-photo', 'screenshot-stitch'],
  'metadata-remove': ['image-compress', 'passport-photo', 'document-scan'],
  'spreadsheet-compare': ['document-scan', 'pdf-merge', 'pdf-compress'],
  'video-compress': ['image-compress', 'camera-mic-test', 'pdf-compress'],
  'passport-photo': ['image-compress', 'metadata-remove', 'document-scan'],
  'document-scan': ['image-to-pdf', 'pdf-merge', 'spreadsheet-compare'],
  'mouse-test': ['keyboard-test', 'camera-mic-test', 'ruler'],
  'keyboard-test': ['mouse-test', 'font-coverage', 'random-word'],
  ruler: ['mouse-test', 'keyboard-test', 'camera-mic-test'],
  'pdf-compress': ['pdf-merge', 'image-to-pdf', 'document-scan'],
  'camera-mic-test': ['mouse-test', 'keyboard-test', 'video-compress'],
  'random-word': ['font-coverage', 'keyboard-test', 'mouse-test'],
  'pdf-merge': ['pdf-compress', 'document-scan', 'screenshot-stitch'],
  'screenshot-stitch': ['image-compress', 'pdf-merge', 'metadata-remove'],
  'font-coverage': ['font-style', 'random-word', 'keyboard-test'],
  'font-style': ['font-coverage', 'random-word', 'ruler'],
  'image-to-pdf': ['pdf-merge', 'pdf-compress', 'document-scan'],
};

export function relatedTools(key: ToolKey, count = 3): ToolKey[] {
  const i = TOOL_KEYS.indexOf(key);
  if (i < 0) return [];

  const out: ToolKey[] = (RELATED[key] ?? []).slice(0, count);

  // Pad from the catalogue, skipping anything already listed. Only reached when
  // a tool has no entry above or when a caller asks for more than it has.
  for (let n = 1; out.length < count && n < TOOL_KEYS.length; n++) {
    const candidate = TOOL_KEYS[(i + n) % TOOL_KEYS.length]!;
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}
