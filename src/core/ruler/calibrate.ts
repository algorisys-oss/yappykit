/**
 * Screen calibration for the on-screen ruler.
 *
 * A browser has no way to ask the display how physically large it is. CSS
 * defines an inch as exactly 96 px regardless of the real hardware, so a ruler
 * drawn from CSS units is wrong on most screens — commonly by 10–40%.
 *
 * The fix is to measure against a known object. Payment and ID cards are
 * manufactured to ISO/IEC 7810 ID-1, which fixes them at 85.60 × 53.98 mm
 * worldwide, making a bank card the one precisely-sized reference nearly
 * everyone has to hand. The user matches an on-screen outline to their card;
 * that outline's width in CSS pixels yields the screen's true pixel density,
 * and every measurement derives from it.
 */

/** ISO/IEC 7810 ID-1 — the size of every credit, debit and most ID cards. */
export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;

export const MM_PER_INCH = 25.4;

/** The CSS-spec assumption, used until the user calibrates. */
export const DEFAULT_PPI = 96;

/**
 * Bounds on a believable calibration. Below ~50 the card outline would be
 * implausibly wide for any real display; above ~600 exceeds any shipping
 * device's CSS pixel density. Values outside this are a mis-drag or corrupt
 * storage, not a real screen.
 */
export const MIN_PPI = 50;
export const MAX_PPI = 600;

export function isPlausiblePpi(ppi: number): boolean {
  return Number.isFinite(ppi) && ppi >= MIN_PPI && ppi <= MAX_PPI;
}

/** Pixels-per-inch implied by a card outline drawn `widthPx` CSS pixels wide. */
export function ppiFromCardWidth(widthPx: number): number {
  return widthPx / (CARD_WIDTH_MM / MM_PER_INCH);
}

/** The inverse: how wide to draw the card outline at a given density. */
export function cardWidthForPpi(ppi: number): number {
  return (CARD_WIDTH_MM / MM_PER_INCH) * ppi;
}

export function mmToPx(mm: number, ppi: number): number {
  return (mm / MM_PER_INCH) * ppi;
}

export function pxToMm(px: number, ppi: number): number {
  return (px / ppi) * MM_PER_INCH;
}

export function inchToPx(inch: number, ppi: number): number {
  return inch * ppi;
}

export function pxToInch(px: number, ppi: number): number {
  return px / ppi;
}

export type Unit = 'cm' | 'inch';

export interface Tick {
  /** Offset from the ruler's zero, in CSS pixels. */
  px: number;
  /** Relative tick height: 1 = major (labelled), down to 0.4 = finest. */
  weight: number;
  /** Present only on major ticks. */
  label?: string;
}

/**
 * Tick marks for a ruler `lengthPx` long.
 *
 * Centimetres subdivide into millimetres, with a half-centimetre mid tick.
 * Inches subdivide in the customary binary fractions down to sixteenths, which
 * is what makes an inch ruler readable — decimal subdivisions of an inch are
 * not what anyone measures against.
 */
export function ticks(lengthPx: number, ppi: number, unit: Unit): Tick[] {
  const out: Tick[] = [];
  if (!(lengthPx > 0) || !isPlausiblePpi(ppi)) return out;

  if (unit === 'cm') {
    const perMm = mmToPx(1, ppi);
    const count = Math.floor(lengthPx / perMm);
    for (let i = 0; i <= count; i++) {
      const isCm = i % 10 === 0;
      const isHalf = i % 5 === 0;
      out.push({
        px: i * perMm,
        weight: isCm ? 1 : isHalf ? 0.6 : 0.4,
        ...(isCm ? { label: String(i / 10) } : {}),
      });
    }
    return out;
  }

  const perSixteenth = inchToPx(1 / 16, ppi);
  const count = Math.floor(lengthPx / perSixteenth);
  for (let i = 0; i <= count; i++) {
    const isInch = i % 16 === 0;
    const isHalf = i % 8 === 0;
    const isQuarter = i % 4 === 0;
    const isEighth = i % 2 === 0;
    out.push({
      px: i * perSixteenth,
      weight: isInch ? 1 : isHalf ? 0.75 : isQuarter ? 0.6 : isEighth ? 0.5 : 0.4,
      ...(isInch ? { label: String(i / 16) } : {}),
    });
  }
  return out;
}

/** Format a pixel offset as a reading in the chosen unit. */
export function readout(px: number, ppi: number, unit: Unit): string {
  if (unit === 'cm') return `${(pxToMm(px, ppi) / 10).toFixed(1)}`;
  return `${pxToInch(px, ppi).toFixed(2)}`;
}

const STORAGE_KEY = 'yappykit-ruler-ppi';

/** Read a saved calibration, ignoring anything implausible or corrupt. */
export function loadPpi(storage: Pick<Storage, 'getItem'>): number | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return isPlausiblePpi(n) ? n : null;
}

export function savePpi(storage: Pick<Storage, 'setItem'>, ppi: number): void {
  if (!isPlausiblePpi(ppi)) throw new Error(`Refusing to save implausible PPI: ${ppi}`);
  storage.setItem(STORAGE_KEY, String(ppi));
}

export function clearPpi(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY);
}
