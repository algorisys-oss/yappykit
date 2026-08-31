/**
 * Font finder: which of these fonts can draw this text.
 *
 * The pieces are separate because they fail separately. ./sfnt gets bytes out
 * of a container, ./cmap turns one table into a coverage answer, ./text decides
 * what the text actually demands. This file joins them and does the comparing.
 */
import { parseCmap, EMPTY_COVERAGE, type Coverage } from './cmap';
import { openFonts, readNames, type ByteSource } from './sfnt';
import type { RequiredChar } from './text';

export type { ByteSource, Coverage, RequiredChar };
export { bytesSource, blobSource, openFonts, sniffFormat, FontFormatError } from './sfnt';
export type { FontFormat, FontFormatCode } from './sfnt';
export { requiredCharacters, codepointLabel, isIgnorable } from './text';

/** Where a font came from, which is the difference the user cares about. */
export type FontOrigin = 'installed' | 'file';

export interface FontEntry {
  id: string;
  family: string;
  style: string;
  fullName: string;
  origin: FontOrigin;
  /** The file it was read from. Absent for an installed font. */
  fileName?: string;
  coverage: Coverage;
  /** How many code points the font maps to a real glyph. */
  glyphCount: number;
  symbolic: boolean;
}

export interface ReadOptions {
  origin: FontOrigin;
  fileName?: string;
  /**
   * The face the caller is actually asking about. A .ttc holds several fonts
   * and the Local Font Access API hands back the whole file once per face, so
   * without this every member would be listed once per member.
   */
  preferName?: string;
}

/**
 * Every font in one file, as entries.
 *
 * Throws FontFormatError when the file is not a font we can read; a font that
 * is readable but carries no cmap comes back with empty coverage instead,
 * because that is a real font with nothing to offer rather than a bad file.
 */
export async function readFonts(src: ByteSource, options: ReadOptions): Promise<FontEntry[]> {
  const resources = await openFonts(src);

  const entries: FontEntry[] = [];
  for (const [index, resource] of resources.entries()) {
    const nameTable = await resource.read('name');
    const names = nameTable ? readNames(nameTable) : { family: '', style: '', fullName: '' };
    const cmapTable = await resource.read('cmap');
    const coverage = cmapTable ? parseCmap(cmapTable) : EMPTY_COVERAGE;

    const fallback = baseName(options.fileName);
    const family = names.family || fallback;
    const fullName = names.fullName || family;
    entries.push({
      id: `${options.origin}:${options.fileName ?? ''}:${index}:${fullName}`,
      family,
      style: names.style,
      fullName,
      origin: options.origin,
      ...(options.fileName ? { fileName: options.fileName } : {}),
      coverage,
      glyphCount: coverage.count,
      symbolic: coverage.symbolic,
    });
  }

  if (options.preferName && entries.length > 1) {
    const wanted = options.preferName.toLowerCase();
    const hit = entries.find(
      (e) =>
        e.fullName.toLowerCase() === wanted ||
        `${e.family} ${e.style}`.trim().toLowerCase() === wanted,
    );
    return [hit ?? entries[0]!];
  }
  return entries;
}

function baseName(fileName?: string): string {
  if (!fileName) return '';
  return fileName.replace(/\.[^.]+$/, '');
}

export interface FontMatch {
  font: FontEntry;
  /** Code points the font cannot draw, in the order they appear in the text. */
  missing: number[];
}

export interface MatchReport {
  complete: FontMatch[];
  partial: FontMatch[];
}

/** Font-menu order: the same collation a native font list uses. */
const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

export function matchFonts(fonts: FontEntry[], required: RequiredChar[]): MatchReport {
  const complete: FontMatch[] = [];
  const partial: FontMatch[] = [];

  for (const font of fonts) {
    const missing = required.filter((c) => !font.coverage.has(c.codepoint)).map((c) => c.codepoint);
    (missing.length === 0 ? complete : partial).push({ font, missing });
  }

  complete.sort((a, b) => compareNames(a.font, b.font));
  // Fewest gaps first: a font missing one character is a candidate, and one
  // missing forty is just a font that does not speak this language.
  partial.sort((a, b) => a.missing.length - b.missing.length || compareNames(a.font, b.font));
  return { complete, partial };
}

function compareNames(a: FontEntry, b: FontEntry): number {
  return byName.compare(a.family, b.family) || byName.compare(a.style, b.style);
}
