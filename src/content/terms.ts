/**
 * Terms of Use: the legal text, as data.
 *
 * ENGLISH ONLY, deliberately, and served at one URL. This follows the same rule
 * as the Privacy Policy (see ROUTES.terms in ../i18n/routes): a
 * machine-translated legal document is a liability rather than an asset, and
 * publishing twelve versions of a liability disclaimer would multiply the
 * problem rather than solve it.
 *
 * Held as data rather than JSX so the prerenderer and the Solid route render the
 * identical words. A legal page in particular must be readable without
 * JavaScript, so it is prerendered in full.
 *
 * NOT LEGAL ADVICE. This is a standard-form disclaimer. The governing
 * jurisdiction is settled: India, with the courts at Mumbai. One thing still
 * needs a decision from the operator: the legal entity behind "we", which must
 * be the exact registered name and form rather than a trading name.
 */

export interface TermsSection {
  /** Stable anchor id, so the sections can be linked to directly. */
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export const TERMS_UPDATED = '20 August 2026';

export const TERMS_INTRO =
  'These Terms of Use govern your use of YappyKit. By using the tools on this site you agree to them. They are written to be read, not to be skipped: the sections on results and liability in particular describe real limits on what these tools can promise you.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 'the-service',
    heading: 'What YappyKit provides',
    paragraphs: [
      'YappyKit is a collection of free, browser-based utilities. The processing happens on your own device: your files are read and transformed inside your browser tab and are not uploaded to our servers. The tools are provided for your convenience, without charge and without any account.',
      'Because there is no account and no server-side processing, we hold nothing on your behalf. We do not store your files, we cannot recover them, and we cannot see what you did with a tool.',
    ],
  },
  {
    id: 'no-guarantee',
    heading: 'Results are not guaranteed',
    paragraphs: [
      'The tools are provided on an “as is” and “as available” basis. Their output is produced automatically, by software, without human review. We make no warranty (express or implied) that any result will be accurate, complete, error-free, of any particular quality, or suitable for the purpose you have in mind.',
      'Automated processing has genuine limits, and the outputs of these tools are affected by them. To be specific about our own tools rather than vague about software in general:',
    ],
    bullets: [
      'Compression is lossy. A compressed image or video is not identical to the original, and a file that meets a size target may not meet a quality expectation.',
      'Text recognition (OCR) misreads characters, particularly on uneven lighting, handwriting, unusual fonts or low-resolution scans. Extracted text should always be proofread.',
      'A passport or visa photo produced here is sized to published specifications, but acceptance is decided by the issuing authority, not by this tool. We cannot guarantee that any photo will be accepted.',
      'A spreadsheet comparison reflects the key column you chose. A different key produces a different, equally valid answer, and neither is a substitute for checking the figures.',
      'Metadata removal covers the metadata blocks this tool understands. It is not a guarantee that a file is anonymous, and it does not remove information visible in the image itself.',
      'The on-screen ruler is only as accurate as the calibration you performed. It is not a certified measuring instrument.',
      'The input-device tests report what your browser was told by the operating system. They are a diagnostic aid, not a hardware certification.',
    ],
  },
  {
    id: 'your-review',
    heading: 'Check the output before you rely on it',
    paragraphs: [
      'You are responsible for reviewing every result before you use it. Please treat any output as a draft that a person still needs to check, not as a finished, verified document.',
      'This matters most where a mistake is expensive or hard to undo. Before submitting anything to a government department, an employer, a court, a bank, an insurer, a university or a medical provider, and before relying on a result for any legal, financial, immigration, professional or safety-related decision, verify it yourself or have it checked by a qualified person. Where an official body publishes its own requirements, those requirements govern, not our tools and not this site.',
      'Keep your original files. Since the processing is local, we have no copy to restore for you.',
    ],
  },
  {
    id: 'liability',
    heading: 'Limitation of liability',
    paragraphs: [
      'To the fullest extent permitted by law, we accept no liability for any loss or damage arising from your use of this site or the tools on it, or from any reliance placed on their output. This includes (without limitation) rejected applications or submissions, missed deadlines, loss of or damage to files, loss of data, lost profits, business interruption, and any indirect or consequential loss.',
      'Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence, or for fraud. Where you deal with us as a consumer, your statutory rights are unaffected.',
      'If a limitation above is held to be unenforceable in your jurisdiction, the remaining provisions continue to apply, and our total liability is limited to the amount you paid to use the tools, which, as they are free, is nothing.',
    ],
  },
  {
    id: 'your-files',
    heading: 'Your files and your rights in them',
    paragraphs: [
      'You keep every right you already had in the files you process. We claim no ownership, no licence and no interest in your content, and (because nothing is uploaded) we never receive it in the first place.',
      'You are responsible for having the right to process the files you use here, and for complying with any law, contract or confidentiality obligation that applies to them.',
    ],
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    paragraphs: ['When using this site, please do not:'],
    bullets: [
      'Use the tools to create, alter or process material unlawfully, including forging or falsifying identity documents, certificates or official records.',
      'Process material you have no right to process, or that infringes someone else’s rights.',
      'Attempt to disrupt, overload, probe or gain unauthorised access to the site or its infrastructure.',
      'Reproduce the site itself, or substantial parts of its content, as your own service.',
    ],
  },
  {
    id: 'availability',
    heading: 'Availability and changes',
    paragraphs: [
      'We may add, change, suspend or withdraw any tool at any time, and the site may be unavailable from time to time. Because the tools run in your browser, they depend on your device and browser supporting the features they need; where a browser cannot run a tool, we say so rather than failing silently.',
      'We may update these Terms. The date at the top of this page shows when they last changed, and continuing to use the site after a change means you accept the updated Terms.',
    ],
  },
  {
    id: 'third-parties',
    heading: 'Advertising, analytics and third-party links',
    paragraphs: [
      'This site may display advertising and use analytics. Those scripts are operated by third parties, make their own network requests, and are governed by their own terms and privacy policies. Our Privacy Policy explains this distinction precisely, including what stays on your device and what does not.',
      'Where we link to another site (including our own related products) we are not responsible for its content or its practices.',
    ],
  },
  {
    id: 'governing-law',
    heading: 'Governing law',
    paragraphs: [
      'These Terms are governed by the laws of India. Our principal place of business is Mumbai, Maharashtra, India, and the courts at Mumbai have jurisdiction over any dispute arising out of or relating to these Terms or your use of this site.',
      'Where mandatory consumer-protection law in your country of residence grants you stronger rights, nothing in these Terms reduces them, and you may bring proceedings in your local courts where that law allows.',
    ],
  },
  {
    id: 'contact',
    heading: 'Contact',
    paragraphs: [
      'Questions about these Terms can be sent to osappsupport@gmail.com.',
    ],
  },
];
