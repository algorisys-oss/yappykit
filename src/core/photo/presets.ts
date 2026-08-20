/**
 * Passport / visa photo presets.
 *
 * Each preset is a physical size + DPI; the pixel dimensions are derived so the
 * exported JPEG prints at the right physical size. Specs carry `sourceUrl` and
 * `lastVerified` because official requirements change (docs/10 #9) — show
 * `lastVerified` in the UI so users can judge freshness.
 *
 * Auto background replacement is deferred (docs/10 #3); v1 relies on the user
 * shooting against a plain light wall and framing with the face guide.
 */

export interface PhotoPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  /** Where the head should sit, as a fraction of frame height, for the guide. */
  headTopFraction: number;
  headHeightFraction: number;
  sourceUrl: string;
  lastVerified: string; // ISO date
}

export const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: 'us-visa',
    label: 'US Visa / Passport (2×2 in)',
    widthMm: 50.8,
    heightMm: 50.8,
    dpi: 300,
    headTopFraction: 0.12,
    headHeightFraction: 0.6,
    sourceUrl: 'https://travel.state.gov/content/travel/en/passports/how-apply/photos.html',
    lastVerified: '2026-07-24',
  },
  {
    id: 'schengen',
    label: 'Schengen Visa (35×45 mm)',
    widthMm: 35,
    heightMm: 45,
    dpi: 600,
    headTopFraction: 0.1,
    headHeightFraction: 0.72,
    sourceUrl: 'https://home-affairs.ec.europa.eu/',
    lastVerified: '2026-07-24',
  },
  {
    id: 'india-passport',
    label: 'India Passport (35×45 mm)',
    widthMm: 35,
    heightMm: 45,
    dpi: 600,
    headTopFraction: 0.1,
    headHeightFraction: 0.72,
    sourceUrl: 'https://www.passportindia.gov.in/',
    lastVerified: '2026-07-24',
  },
  {
    id: 'uk-passport',
    label: 'UK Passport (35×45 mm)',
    widthMm: 35,
    heightMm: 45,
    dpi: 600,
    headTopFraction: 0.1,
    headHeightFraction: 0.72,
    sourceUrl: 'https://www.gov.uk/photos-for-passports',
    lastVerified: '2026-07-24',
  },
];

const MM_PER_INCH = 25.4;

export interface PixelSize {
  width: number;
  height: number;
}

export function presetPixels(preset: PhotoPreset): PixelSize {
  return {
    width: Math.round((preset.widthMm / MM_PER_INCH) * preset.dpi),
    height: Math.round((preset.heightMm / MM_PER_INCH) * preset.dpi),
  };
}

export interface SheetPlan {
  /** Print sheet pixel size (default 4×6 in). */
  sheet: PixelSize;
  cols: number;
  rows: number;
  count: number;
  gap: number;
  marginX: number;
  marginY: number;
}

/**
 * Lay out as many preset photos as fit on a 4×6 in print sheet at preset DPI.
 * Default gap is 0 — the photos abut and are cut apart on the shared edges, which
 * is how print shops pack them (a positive gap would drop a whole column for
 * exact-fit sizes like 2×2 in on a 6 in edge).
 */
export function planPrintSheet(preset: PhotoPreset, sheetWidthIn = 6, sheetHeightIn = 4, gapMm = 0): SheetPlan {
  const dpi = preset.dpi;
  const sheet: PixelSize = {
    width: Math.round(sheetWidthIn * dpi),
    height: Math.round(sheetHeightIn * dpi),
  };
  const photo = presetPixels(preset);
  const gap = Math.round((gapMm / MM_PER_INCH) * dpi);
  const cols = Math.max(0, Math.floor((sheet.width + gap) / (photo.width + gap)));
  const rows = Math.max(0, Math.floor((sheet.height + gap) / (photo.height + gap)));
  const usedW = cols * photo.width + Math.max(0, cols - 1) * gap;
  const usedH = rows * photo.height + Math.max(0, rows - 1) * gap;
  return {
    sheet,
    cols,
    rows,
    count: cols * rows,
    gap,
    marginX: Math.round((sheet.width - usedW) / 2),
    marginY: Math.round((sheet.height - usedH) / 2),
  };
}
