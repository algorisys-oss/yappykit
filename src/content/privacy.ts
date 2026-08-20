/**
 * Privacy Policy: the text, as data.
 *
 * Held as data for the same reason as ../content/terms: the prerenderer and the
 * Solid route must render the identical words, and the two copies must not be
 * able to drift. This page previously existed only as JSX and was skipped by
 * the prerenderer entirely, so the static HTML carried a heading, a footer and
 * no policy. A privacy policy that appears only after JavaScript runs is not
 * much of a policy, and this is the one page docs/07 names as a hard AdSense
 * requirement.
 *
 * ENGLISH ONLY and served at one URL, per ROUTES.privacy: a machine-translated
 * legal document is a liability rather than an asset.
 *
 * PRECISE, NEVER OVERCLAIMING. The brand's core claim is narrow on purpose
 * (docs/08): your files stay on the device, while the page itself behaves like
 * any ad-supported page. Every sentence here has to keep that distinction
 * intact, because overclaiming it is disproportionately damaging.
 */

/** A cell in the "your files vs the page" table. */
export interface PrivacyCell {
  text: string;
  /** `good` marks the reassuring answer; `muted` the honest, less exciting one. */
  tone?: 'good' | 'muted';
}

export interface PrivacyTable {
  columns: string[];
  rows: PrivacyCell[][];
}

/** A bullet, optionally opening with a bolded label. */
export interface PrivacyBullet {
  label?: string;
  text: string;
}

export interface PrivacySection {
  /** Stable anchor id, so a section can be linked to directly. */
  id: string;
  heading: string;
  paragraphs?: string[];
  table?: PrivacyTable;
  bullets?: PrivacyBullet[];
  /** Appended to the section as a mailto link. */
  email?: string;
}

export const PRIVACY_UPDATED = '20 August 2026';

/**
 * The opening claim, split so both renderers can bold the same sentence.
 *
 * `claim` is the exact wording docs/08 permits us to make. It is kept as its
 * own field rather than marked up inline so that it cannot be edited into
 * something broader by accident.
 */
export const PRIVACY_LEAD = {
  before: 'YappyKit is built so your files never leave your device.',
  claim:
    'Your selected files are processed locally in your browser and are not uploaded to our application servers.',
  after:
    'Advertising, analytics and other third-party scripts on the page may still make ordinary network requests, as on any website. This policy explains that distinction precisely.',
};

/**
 * Emphasis inside a paragraph, written as *asterisks* in the data above.
 *
 * Shared by both renderers so the emphasis itself cannot drift. The data stays
 * plain text, which keeps it escapable: the prerenderer escapes first and adds
 * the tags afterwards, so no content here can inject markup.
 */
export function emphasise(text: string): Array<{ text: string; em: boolean }> {
  return text
    .split(/\*([^*]+)\*/g)
    .map((chunk, i) => ({ text: chunk, em: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'who-we-are',
    heading: 'Who "we" means',
    paragraphs: [
      'YappyKit is a personal project operated by Rajesh Pillai, an individual based in Mumbai, Maharashtra, India. Under India\'s Digital Personal Data Protection Act, 2023 that person is the Data Fiduciary for any personal data this site is responsible for, and can be reached at the address at the end of this policy.',
    ],
  },
  {
    id: 'files-vs-page',
    heading: 'Your files vs. the page',
    paragraphs: ['Two separate things happen on a YappyKit page:'],
    table: {
      columns: ['What', 'Where it happens', 'Leaves your device?'],
      rows: [
        [
          { text: 'Your file (photo, PDF, spreadsheet, video)' },
          { text: 'Your browser (JavaScript / WebAssembly)' },
          { text: 'No', tone: 'good' },
        ],
        [
          { text: 'The page itself (scripts, ads, analytics)' },
          { text: 'Loaded from a CDN; ad/analytics talk to their providers' },
          { text: 'Yes, as any web page does', tone: 'muted' },
        ],
      ],
    },
  },
  {
    id: 'verify-it',
    heading: 'How to check this yourself',
    paragraphs: [
      'Your *content* is private. Your *visit* is as private as any ad-supported web page, subject to normal third-party tracking.',
      "You do not have to take the first row on trust. Open your browser's developer tools, go to the Network tab, run any tool on a real file, and watch: no request carries your file. Almost no competitor can invite you to check in the same way, because on their sites the upload is the product.",
    ],
  },
  {
    id: 'what-we-collect',
    heading: "What we do and don't collect",
    bullets: [
      { text: 'We do not receive, store, or transmit the files you process. There is no upload.' },
      {
        text: 'We do not require an account and do not ask for your name or email to use the tools.',
      },
      {
        text: 'Third-party services on the page (advertising and analytics) may set cookies and receive your IP address, device and browser information, and advertising identifiers, the same data those services receive on any site that uses them.',
      },
    ],
  },
  {
    id: 'third-parties',
    heading: 'Third-party services',
    paragraphs: [
      'YappyKit is free and supported by advertising. The pages use, or may use, the following third parties, each governed by its own privacy policy:',
    ],
    bullets: [
      {
        label: 'Advertising',
        text: '(e.g. Google AdSense): serves ads and may use cookies and device identifiers to measure and personalise them.',
      },
      {
        label: 'Analytics',
        text: '(Google Analytics): measures aggregate usage, such as which tools are opened and from which country, so we can improve them. It sets cookies and receives your IP address. It never receives your files.',
      },
      {
        label: 'Content delivery network (CDN)',
        text: ": serves the site's static files (the app code, not your files).",
      },
    ],
  },
  {
    id: 'on-your-device',
    heading: 'What is stored on your device',
    paragraphs: [
      'To make the tools work and remember your preferences, YappyKit stores a small amount of data *on your device*, not on our servers: your light/dark theme choice, and cached program assets (via the browser cache, IndexedDB or OPFS) so tools load faster and work offline.',
      "You can clear this at any time from your browser's site settings. Where a tool downloads something larger to do its job, such as an OCR language pack or the video engine, it is cached the same way and never leaves your device either.",
    ],
  },
  {
    id: 'cookies',
    heading: 'Cookies and consent',
    paragraphs: [
      'Where your jurisdiction requires it, we ask for your consent before advertising cookies that personalise ads are set. You can change or withdraw consent at any time.',
    ],
  },
  {
    id: 'your-rights',
    heading: 'Your rights',
    paragraphs: [
      'Because we operate from India, the DPDP Act named above applies to us. If you are in another jurisdiction, its own law may give you further rights, for example the EU or UK GDPR.',
      'Those rights typically include access to personal data held about you, correction of it, erasure of it, and objecting to certain processing. In practice there is very little for us to act on: we hold no account and none of your files. Requests therefore concern the advertising and analytics providers listed above, and you can exercise your rights directly with them as well as through us.',
    ],
  },
  {
    id: 'contact',
    heading: 'Contact',
    paragraphs: ['Questions about this policy or your privacy? Contact us at'],
    email: 'osappsupport@gmail.com',
  },
];
