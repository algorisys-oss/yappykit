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
  'video-trim',
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
  'screenshot-split',
  'color-picker',
  'batch-rename',
  'sheet-convert',
  'font-coverage',
  'font-style',
  'image-to-pdf',
  'image-watermark',
  'file-inspect',
  'image-convert',
  'pdf-split',
  'pdf-to-images',
  'redact',
  'sheet-clean',
  'image-resize',
  'image-crop',
  'pdf-password',
  'markdown-to-pdf',
] as const;

export type ToolKey = (typeof TOOL_KEYS)[number];

/**
 * What kind of job each tool does, for the filter on the landing page.
 *
 * Structural rather than editorial: the labels translate, the grouping does
 * not. Every tool must appear exactly once, which routes.test.ts enforces, so
 * adding a tool without categorising it fails the build rather than quietly
 * dropping it out of every filter.
 */
export const CATEGORIES = ['image', 'pdf', 'video', 'data', 'text', 'device'] as const;

export type Category = (typeof CATEGORIES)[number];

export const TOOL_CATEGORY: Record<ToolKey, Category> = {
  'image-compress': 'image',
  'image-convert': 'image',
  'image-resize': 'image',
  'image-crop': 'image',
  'image-watermark': 'image',
  'metadata-remove': 'image',
  'passport-photo': 'image',
  'screenshot-stitch': 'image',
  'screenshot-split': 'image',
  'color-picker': 'image',
  'batch-rename': 'image',
  'sheet-convert': 'data',
  'pdf-password': 'pdf',
  'image-to-pdf': 'pdf',
  'pdf-compress': 'pdf',
  'pdf-merge': 'pdf',
  'pdf-split': 'pdf',
  'pdf-to-images': 'pdf',
  redact: 'pdf',
  'document-scan': 'pdf',
  'markdown-to-pdf': 'pdf',
  'video-compress': 'video',
  'video-trim': 'video',
  'spreadsheet-compare': 'data',
  'sheet-clean': 'data',
  'file-inspect': 'data',
  'font-coverage': 'text',
  'font-style': 'text',
  'random-word': 'text',
  'mouse-test': 'device',
  'keyboard-test': 'device',
  'camera-mic-test': 'device',
  ruler: 'device',
};

export function toolsInCategory(category: Category): ToolKey[] {
  return TOOL_KEYS.filter((k) => TOOL_CATEGORY[k] === category);
}

/** The route key for a category's hub page, e.g. `category/image`. */
export type CategoryKey = `category/${Category}`;

export function categoryRouteKey(category: Category): CategoryKey {
  return `category/${category}`;
}

/** The category a route key belongs to, or null when it is not a hub page. */
export function categoryFor(key: RouteKey): Category | null {
  if (!key.startsWith('category/')) return null;
  return key.slice('category/'.length) as Category;
}

/**
 * Tools that have a build guide written: a step-by-step account of how the tool
 * was actually made, for the technical reader. English only, and deliberately a
 * separate page rather than more text on the tool itself, so that someone who
 * just wants to drop a file in is not scrolled past a tutorial to reach it.
 *
 * This list, not the content module, is the source of truth for which pages
 * exist. `BUILD_GUIDES` in ../content/build-guides is typed against it, so a
 * name here with no guide written fails the typecheck rather than publishing an
 * empty page, and a guide written for a tool not listed here is unreachable and
 * equally caught. Add a tool to both, in the same commit.
 */
export const BUILD_GUIDE_TOOLS = [
  'pdf-password',
  'image-compress',
  'metadata-remove',
  'sheet-convert',
  'video-compress',
  'redact',
] as const satisfies readonly ToolKey[];

export type BuildGuideTool = (typeof BUILD_GUIDE_TOOLS)[number];

/** The route key for a tool's build guide, e.g. `build/pdf-password`. */
export type BuildKey = `build/${BuildGuideTool}`;
export type RouteKey =
  | ToolKey
  | BuildKey
  | CategoryKey
  | 'home'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'how-it-works'
  | 'build';

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

const STATIC_ROUTES: Record<Exclude<RouteKey, BuildKey | CategoryKey>, RouteDef> = {
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
  'markdown-to-pdf': {
    localized: true,
    slugs: {
      en: 'markdown-to-pdf',
      es: 'markdown-a-pdf',
      'pt-BR': 'markdown-para-pdf',
      id: 'markdown-ke-pdf',
      fr: 'markdown-en-pdf',
      de: 'markdown-in-pdf',
      ru: 'markdown-v-pdf',
      tr: 'markdown-pdf-donustur',
      vi: 'markdown-sang-pdf',
      it: 'markdown-in-pdf',
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
  'video-trim': {
    localized: true,
    slugs: {
      en: 'trim-a-video',
      es: 'recortar-un-video',
      'pt-BR': 'cortar-um-video',
      id: 'potong-video',
      fr: 'couper-une-video',
      de: 'video-zuschneiden',
      ru: 'obrezat-video',
      tr: 'video-kirp',
      vi: 'cat-video',
      it: 'tagliare-un-video',
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
  'screenshot-split': {
    localized: true,
    slugs: {
      en: 'split-a-long-screenshot',
      es: 'dividir-una-captura-larga',
      'pt-BR': 'dividir-uma-captura-longa',
      id: 'pisah-tangkapan-layar-panjang',
      fr: 'decouper-une-longue-capture',
      de: 'langen-screenshot-teilen',
      ru: 'razdelit-dlinnyy-skrinshot',
      tr: 'uzun-ekran-goruntusunu-bol',
      vi: 'chia-anh-chup-man-hinh-dai',
      it: 'dividere-uno-screenshot-lungo',
    },
  },
  'color-picker': {
    localized: true,
    slugs: {
      en: 'color-picker-from-image',
      es: 'selector-de-color-de-imagen',
      'pt-BR': 'seletor-de-cor-da-imagem',
      id: 'pemilih-warna-dari-gambar',
      fr: 'pipette-a-couleurs-dune-image',
      de: 'farbwaehler-aus-bild',
      ru: 'pipetka-tsveta-iz-izobrazheniya',
      tr: 'gorselden-renk-secici',
      vi: 'chon-mau-tu-anh',
      it: 'selettore-di-colori-da-immagine',
    },
  },
  'batch-rename': {
    localized: true,
    slugs: {
      en: 'batch-rename-images',
      es: 'renombrar-imagenes-por-lotes',
      'pt-BR': 'renomear-imagens-em-lote',
      id: 'ganti-nama-gambar-massal',
      fr: 'renommer-des-images-en-lot',
      de: 'bilder-stapelweise-umbenennen',
      ru: 'pereimenovat-izobrazheniya-paketno',
      tr: 'toplu-resim-yeniden-adlandirma',
      vi: 'doi-ten-hang-loat-anh',
      it: 'rinominare-immagini-in-blocco',
    },
  },
  'pdf-password': {
    localized: true,
    slugs: {
      en: 'password-protect-pdf',
      es: 'proteger-pdf-con-contrasena',
      'pt-BR': 'proteger-pdf-com-senha',
      id: 'proteksi-pdf-dengan-kata-sandi',
      fr: 'proteger-un-pdf-par-mot-de-passe',
      de: 'pdf-mit-passwort-schuetzen',
      ru: 'zashchitit-pdf-parolem',
      tr: 'pdf-parola-koruma',
      vi: 'dat-mat-khau-cho-pdf',
      it: 'proteggere-pdf-con-password',
    },
  },
  'sheet-convert': {
    localized: true,
    slugs: {
      en: 'csv-to-excel-converter',
      es: 'convertir-csv-a-excel',
      'pt-BR': 'converter-csv-para-excel',
      id: 'konversi-csv-ke-excel',
      fr: 'convertir-csv-en-excel',
      de: 'csv-in-excel-umwandeln',
      ru: 'konvertirovat-csv-v-excel',
      tr: 'csv-excel-donusturucu',
      vi: 'chuyen-csv-sang-excel',
      it: 'convertire-csv-in-excel',
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
  'image-watermark': {
    localized: true,
    slugs: {
      en: 'add-watermark-to-image',
      es: 'agregar-marca-de-agua-a-imagen',
      'pt-BR': 'adicionar-marca-dagua-em-imagem',
      id: 'tambah-watermark-ke-gambar',
      fr: 'ajouter-un-filigrane-a-une-image',
      de: 'wasserzeichen-zu-bild-hinzufuegen',
      ru: 'dobavit-vodyanoy-znak-na-izobrazhenie',
      tr: 'resme-filigran-ekle',
      vi: 'them-hinh-mo-vao-anh',
      it: 'aggiungere-filigrana-a-immagine',
    },
  },
  'file-inspect': {
    localized: true,
    slugs: {
      en: 'inspect-a-file',
      es: 'inspeccionar-un-archivo',
      'pt-BR': 'inspecionar-um-arquivo',
      id: 'periksa-isi-file',
      fr: 'inspecter-un-fichier',
      de: 'datei-untersuchen',
      ru: 'proverit-fayl',
      tr: 'dosyayi-incele',
      vi: 'kiem-tra-tep',
      it: 'ispezionare-un-file',
    },
  },
  'image-convert': {
    localized: true,
    slugs: {
      en: 'convert-image-format',
      es: 'convertir-formato-de-imagen',
      'pt-BR': 'converter-formato-de-imagem',
      id: 'konversi-format-gambar',
      fr: 'convertir-le-format-dune-image',
      de: 'bildformat-umwandeln',
      ru: 'konvertirovat-format-izobrazheniya',
      tr: 'resim-bicimini-donustur',
      vi: 'chuyen-doi-dinh-dang-anh',
      it: 'convertire-formato-immagine',
    },
  },
  'pdf-split': {
    localized: true,
    slugs: {
      en: 'split-a-pdf',
      es: 'dividir-un-pdf',
      'pt-BR': 'dividir-um-pdf',
      id: 'pisah-halaman-pdf',
      fr: 'diviser-un-pdf',
      de: 'pdf-teilen',
      ru: 'razdelit-pdf',
      tr: 'pdf-bol',
      vi: 'tach-file-pdf',
      it: 'dividere-un-pdf',
    },
  },
  'pdf-to-images': {
    localized: true,
    slugs: {
      en: 'pdf-to-images',
      es: 'pdf-a-imagenes',
      'pt-BR': 'pdf-para-imagens',
      id: 'pdf-ke-gambar',
      fr: 'pdf-en-images',
      de: 'pdf-in-bilder-umwandeln',
      ru: 'pdf-v-izobrazheniya',
      tr: 'pdf-den-resme',
      vi: 'pdf-sang-anh',
      it: 'pdf-in-immagini',
    },
  },
  redact: {
    localized: true,
    slugs: {
      en: 'redact-a-document',
      es: 'censurar-un-documento',
      'pt-BR': 'tarjar-um-documento',
      id: 'sensor-dokumen',
      fr: 'caviarder-un-document',
      de: 'dokument-schwaerzen',
      ru: 'zakrasit-dannye-v-dokumente',
      tr: 'belgeyi-karart',
      vi: 'che-thong-tin-trong-tai-lieu',
      it: 'oscurare-un-documento',
    },
  },
  'sheet-clean': {
    localized: true,
    slugs: {
      en: 'clean-up-a-spreadsheet',
      es: 'limpiar-una-hoja-de-calculo',
      'pt-BR': 'limpar-uma-planilha',
      id: 'bersihkan-spreadsheet',
      fr: 'nettoyer-une-feuille-de-calcul',
      de: 'tabelle-bereinigen',
      ru: 'ochistit-tablitsu',
      tr: 'elektronik-tabloyu-temizle',
      vi: 'don-dep-bang-tinh',
      it: 'pulire-un-foglio-di-calcolo',
    },
  },
  'image-resize': {
    localized: true,
    slugs: {
      en: 'resize-image-to-exact-size',
      es: 'redimensionar-imagen-a-medida-exacta',
      'pt-BR': 'redimensionar-imagem-para-medida-exata',
      id: 'ubah-ukuran-gambar-persis',
      fr: 'redimensionner-une-image-en-pixels-exacts',
      de: 'bild-auf-genaue-groesse-bringen',
      ru: 'izmenit-razmer-izobrazheniya-tochno',
      tr: 'resmi-tam-olcuye-getir',
      vi: 'doi-kich-thuoc-anh-chinh-xac',
      it: 'ridimensionare-immagine-a-misura-esatta',
    },
  },
  'image-crop': {
    localized: true,
    slugs: {
      en: 'crop-an-image',
      es: 'recortar-una-imagen',
      'pt-BR': 'cortar-uma-imagem',
      id: 'potong-gambar',
      fr: 'recadrer-une-image',
      de: 'bild-zuschneiden',
      ru: 'obrezat-izobrazhenie',
      tr: 'resmi-kirp',
      vi: 'cat-anh',
      it: 'ritagliare-un-immagine',
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
  contact: {
    // Localized, unlike the policy pages: this is short, safely translatable
    // copy, and someone who lands on a German page and wants to reach us should
    // not be handed an English page to do it.
    localized: true,
    slugs: {
      en: 'contact',
      es: 'contacto',
      'pt-BR': 'contato',
      id: 'kontak',
      fr: 'contact',
      de: 'kontakt',
      ru: 'kontakty',
      tr: 'iletisim',
      vi: 'lien-he',
      it: 'contatti',
    },
  },
  build: {
    // The hub. English-only for the same reason as the guides themselves.
    localized: false,
    slugs: { en: 'build' },
  },
  'how-it-works': {
    // Single-locale for the same reason as ../content/articles: this is long
    // technical writing whose whole value is precision, and a machine-translated
    // approximation of a precise claim is just a wrong claim.
    localized: false,
    slugs: { en: 'how-it-works' },
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

/**
 * One page per build guide, at `/build/<the tool's English slug>`.
 *
 * Generated rather than written out so the URL of a guide can never drift from
 * the URL of the tool it is about. Multi-segment slugs work because
 * `resolveRoute` matches the whole remainder of the path, not one segment.
 */
const BUILD_ROUTES = Object.fromEntries(
  BUILD_GUIDE_TOOLS.map((tool) => [
    `build/${tool}`,
    { localized: false, slugs: { en: `build/${STATIC_ROUTES[tool].slugs.en}` } } satisfies RouteDef,
  ]),
) as Record<BuildKey, RouteDef>;

/**
 * One hub page per category, listing the tools in it.
 *
 * Short, plural, keyword-bearing slugs, translated like every other localized
 * page: these are the header's navigation targets and the shortest path a
 * returning visitor has to the tool they came back for. PDF is the same word in
 * every locale we ship, so it carries only the English slug and every locale
 * falls back to it.
 */
const CATEGORY_SLUGS: Record<Category, { en: string } & Partial<Record<LocaleCode, string>>> = {
  image: {
    en: 'images',
    es: 'imagenes',
    'pt-BR': 'imagens',
    id: 'gambar',
    fr: 'images',
    de: 'bilder',
    ru: 'izobrazheniya',
    tr: 'resimler',
    vi: 'hinh-anh',
    it: 'immagini',
  },
  pdf: { en: 'pdf' },
  video: {
    en: 'videos',
    es: 'videos',
    'pt-BR': 'videos',
    id: 'video',
    fr: 'videos',
    de: 'videos',
    ru: 'video',
    tr: 'videolar',
    vi: 'video',
    it: 'video',
  },
  data: {
    en: 'spreadsheets',
    es: 'hojas-de-calculo',
    'pt-BR': 'planilhas',
    id: 'spreadsheet',
    fr: 'feuilles-de-calcul',
    de: 'tabellen',
    ru: 'tablitsy',
    tr: 'elektronik-tablolar',
    vi: 'bang-tinh',
    it: 'fogli-di-calcolo',
  },
  text: {
    en: 'fonts',
    es: 'fuentes',
    'pt-BR': 'fontes',
    id: 'font',
    fr: 'polices',
    de: 'schriftarten',
    ru: 'shrifty',
    tr: 'fontlar',
    vi: 'phong-chu',
    it: 'font',
  },
  device: {
    en: 'device-tests',
    es: 'pruebas-de-dispositivo',
    'pt-BR': 'testes-de-dispositivo',
    id: 'tes-perangkat',
    fr: 'tests-materiel',
    de: 'geraete-tests',
    ru: 'testy-ustroystv',
    tr: 'cihaz-testleri',
    vi: 'kiem-tra-thiet-bi',
    it: 'test-dispositivo',
  },
};

const CATEGORY_ROUTES = Object.fromEntries(
  CATEGORIES.map((c) => [categoryRouteKey(c), { localized: true, slugs: CATEGORY_SLUGS[c] }]),
) as Record<CategoryKey, RouteDef>;

export const ROUTES: Record<RouteKey, RouteDef> = {
  ...STATIC_ROUTES,
  ...BUILD_ROUTES,
  ...CATEGORY_ROUTES,
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
  'image-compress': ['image-resize', 'metadata-remove', 'image-convert'],
  'metadata-remove': ['batch-rename', 'image-compress', 'redact'],
  'spreadsheet-compare': ['sheet-clean', 'file-inspect', 'pdf-merge'],
  'video-compress': ['video-trim', 'image-compress', 'camera-mic-test'],
  'video-trim': ['video-compress', 'image-crop', 'camera-mic-test'],
  'passport-photo': ['image-compress', 'metadata-remove', 'document-scan'],
  'document-scan': ['image-to-pdf', 'pdf-merge', 'spreadsheet-compare'],
  'mouse-test': ['keyboard-test', 'camera-mic-test', 'ruler'],
  'keyboard-test': ['mouse-test', 'font-coverage', 'random-word'],
  ruler: ['mouse-test', 'keyboard-test', 'camera-mic-test'],
  'pdf-compress': ['pdf-split', 'pdf-merge', 'image-to-pdf'],
  'camera-mic-test': ['mouse-test', 'keyboard-test', 'video-compress'],
  'random-word': ['font-coverage', 'keyboard-test', 'mouse-test'],
  'pdf-merge': ['pdf-split', 'pdf-compress', 'markdown-to-pdf'],
  'screenshot-stitch': ['screenshot-split', 'image-compress', 'pdf-merge'],
  'screenshot-split': ['screenshot-stitch', 'image-crop', 'image-compress'],
  'color-picker': ['image-convert', 'font-style', 'image-crop'],
  'batch-rename': ['metadata-remove', 'image-compress', 'image-convert'],
  'sheet-convert': ['sheet-clean', 'spreadsheet-compare', 'file-inspect'],
  'font-coverage': ['font-style', 'random-word', 'keyboard-test'],
  'font-style': ['color-picker', 'font-coverage', 'random-word'],
  'image-to-pdf': ['pdf-to-images', 'markdown-to-pdf', 'pdf-merge'],
  'image-watermark': ['color-picker', 'metadata-remove', 'image-compress'],
  'file-inspect': ['image-convert', 'metadata-remove', 'image-compress'],
  'image-convert': ['image-resize', 'image-compress', 'image-watermark'],
  'image-resize': ['image-crop', 'image-compress', 'image-convert'],
  'image-crop': ['image-resize', 'image-compress', 'passport-photo'],
  'pdf-split': ['pdf-to-images', 'pdf-merge', 'pdf-password'],
  'pdf-to-images': ['image-to-pdf', 'pdf-split', 'image-convert'],
  redact: ['metadata-remove', 'pdf-password', 'file-inspect'],
  'sheet-clean': ['sheet-convert', 'spreadsheet-compare', 'redact'],
  'pdf-password': ['redact', 'metadata-remove', 'pdf-merge'],
  'markdown-to-pdf': ['image-to-pdf', 'pdf-merge', 'file-inspect'],
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
