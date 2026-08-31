/**
 * The fonts installed on this device, through the Local Font Access API.
 *
 * BROWSER ONLY, and deliberately thin: everything here is API plumbing that
 * cannot be exercised under jsdom, so the logic it feeds lives in ./index and
 * is unit-tested there. What this file is tested by is tests/e2e.
 *
 * The API is Chromium-only and gated behind a permission prompt, which is
 * correct: the list of fonts someone has installed is a strong fingerprinting
 * signal, and the browser is right to ask. It also means the call must come
 * from a user gesture, so the UI has an explicit button rather than scanning on
 * load. Everywhere the API is missing, the tool still works on font files the
 * user chooses, which is the path that needs no permission at all.
 *
 * Nothing read here leaves the device. The font names and bytes go into the
 * comparison in ./index and are dropped when the page is closed.
 */
import { readFonts, blobSource, FontFormatError, type FontEntry } from './index';

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

type FontQuery = () => Promise<FontData[]>;

export type LocalFontsErrorCode = 'unsupported' | 'denied' | 'failed';

export class LocalFontsError extends Error {
  constructor(readonly code: LocalFontsErrorCode) {
    super(`local fonts: ${code}`);
    this.name = 'LocalFontsError';
  }
}

function queryFn(): FontQuery | null {
  const fn = (globalThis as { queryLocalFonts?: FontQuery }).queryLocalFonts;
  return typeof fn === 'function' ? fn : null;
}

export interface ScanResult {
  entries: FontEntry[];
  /** Faces present on the device that we could not read the coverage of. */
  unreadable: number;
}

export interface ScanOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Also read each font's appearance tables. See ReadOptions.metrics. */
  metrics?: boolean;
}

/**
 * Read every installed font's coverage.
 *
 * Progress is reported and the loop yields, because this is hundreds of files
 * and it runs on the main thread. A worker would be the obvious move, but the
 * permission and the API both live on the window, and the per-font work is a
 * few range reads rather than real computation.
 */
export async function scanInstalledFonts(options: ScanOptions = {}): Promise<ScanResult> {
  const query = queryFn();
  if (!query) throw new LocalFontsError('unsupported');

  let faces: FontData[];
  try {
    faces = await query();
  } catch (err) {
    // The user said no, or the page is not allowed to ask.
    const name = err instanceof Error ? err.name : '';
    throw new LocalFontsError(name === 'SecurityError' || name === 'NotAllowedError' ? 'denied' : 'failed');
  }

  const entries: FontEntry[] = [];
  let unreadable = 0;

  for (const [index, face] of faces.entries()) {
    if (options.signal?.aborted) break;
    try {
      const blob = await face.blob();
      const read = await readFonts(blobSource(blob), {
        origin: 'installed',
        preferName: face.fullName,
        ...(options.metrics ? { metrics: true } : {}),
      });
      // A font whose file we can open but whose coverage is empty tells the
      // user nothing and would pad the "cannot render this" list with noise.
      for (const entry of read) {
        if (entry.glyphCount > 0) entries.push({ ...entry, fullName: face.fullName || entry.fullName });
        else unreadable++;
      }
    } catch (err) {
      // One unreadable font (a bitmap-only face, a format we do not parse) is
      // not a reason to abandon the other three hundred.
      if (err instanceof FontFormatError || err instanceof Error) unreadable++;
      else throw err;
    }
    options.onProgress?.(index + 1, faces.length);
    if (index % 25 === 24) await yieldToPaint();
  }

  return { entries, unreadable };
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
