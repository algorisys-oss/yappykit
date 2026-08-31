/**
 * The characters a font has to have in order to render a piece of text.
 *
 * Two things make this less obvious than "split the string".
 *
 * The first is that JavaScript strings are UTF-16, so an emoji is two units and
 * asking a font about either half asks about a surrogate, which no font maps.
 * Iterating the string yields whole code points instead.
 *
 * The second is that a lot of real text carries code points that are never
 * drawn: the joiners inside an emoji family, the variation selector that makes
 * a heart red, the direction marks around an Arabic phrase, the byte-order mark
 * that a text editor left at the front. A font renders all of that correctly
 * without owning a single glyph for any of it. Counting them would report every
 * font as failing, which is a false negative on the only question being asked.
 */

export interface RequiredChar {
  codepoint: number;
  /** The character itself, for showing back to the user. */
  char: string;
  /** How many times it appears in the text. */
  count: number;
}

/**
 * Code points that are not drawn and so are not a font's responsibility.
 * Ranges, in order, searched linearly: the list is short.
 */
const IGNORABLE: [number, number][] = [
  [0x0000, 0x001f], // C0 controls, which includes tab, newline and return
  [0x007f, 0x009f], // delete and the C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x061c, 0x061c], // Arabic letter mark
  [0x180b, 0x180e], // Mongolian variation selectors and vowel separator
  [0x200b, 0x200f], // zero-width space, ZWNJ, ZWJ, and the LTR/RTL marks
  [0x2028, 0x202e], // line and paragraph separators, bidi embedding controls
  [0x2060, 0x2064], // word joiner and the invisible operators
  [0x2066, 0x206f], // bidi isolates and the deprecated formatting characters
  [0xfe00, 0xfe0f], // variation selectors 1 to 16
  [0xfeff, 0xfeff], // byte-order mark
  [0xfff9, 0xfffb], // interlinear annotation
  [0xe0000, 0xe007f], // language tags
  [0xe0100, 0xe01ef], // variation selectors 17 to 256
];

export function isIgnorable(codepoint: number): boolean {
  return IGNORABLE.some(([lo, hi]) => codepoint >= lo && codepoint <= hi);
}

/** The distinct drawable characters of `text`, in the order they first appear. */
export function requiredCharacters(text: string): RequiredChar[] {
  const seen = new Map<number, RequiredChar>();
  for (const char of text) {
    const codepoint = char.codePointAt(0)!;
    if (isIgnorable(codepoint)) continue;
    const hit = seen.get(codepoint);
    if (hit) hit.count++;
    else seen.set(codepoint, { codepoint, char, count: 1 });
  }
  return [...seen.values()];
}

/** "U+20B9" — how the Unicode charts write a code point, and how people search for one. */
export function codepointLabel(codepoint: number): string {
  return `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
}
