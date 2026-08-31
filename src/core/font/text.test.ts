import { describe, it, expect } from 'vitest';
import { requiredCharacters, isIgnorable, codepointLabel } from './text';

const cps = (text: string) => requiredCharacters(text).map((c) => c.codepoint);

describe('requiredCharacters', () => {
  it('treats an astral character as one character, not two halves', () => {
    // "😀" is a surrogate pair in JavaScript. Splitting on .length asks every
    // font about U+D83D and U+DE00, which no font maps and every font fails.
    expect(cps('😀')).toEqual([0x1f600]);
  });

  it('counts repeats without repeating the entry', () => {
    expect(requiredCharacters('aab')).toEqual([
      { codepoint: 0x61, char: 'a', count: 2 },
      { codepoint: 0x62, char: 'b', count: 1 },
    ]);
  });

  it('keeps first-appearance order, so the list reads like the text', () => {
    expect(requiredCharacters('cab').map((c) => c.char)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the ordinary space, which an icon font really can be missing', () => {
    expect(cps('a b')).toContain(0x20);
  });

  it('drops the line breaks and tabs that come with pasted text', () => {
    expect(cps('a\r\n\tb')).toEqual([0x61, 0x62]);
  });

  /**
   * These code points are invisible by design: they steer joining, shaping and
   * direction. A font renders text containing them perfectly well without
   * having a glyph for any of them, so counting them would fail every font.
   */
  it('drops the invisible formatting characters', () => {
    expect(cps('a‍b')).toEqual([0x61, 0x62]); // zero-width joiner
    expect(cps('a‌b')).toEqual([0x61, 0x62]); // zero-width non-joiner
    expect(cps('a­b')).toEqual([0x61, 0x62]); // soft hyphen
    expect(cps('﻿a')).toEqual([0x61]); // byte-order mark
    expect(cps('a‮b')).toEqual([0x61, 0x62]); // right-to-left override
    expect(cps('❤️')).toEqual([0x2764]); // emoji variation selector
    expect(cps('葛󠄀')).toEqual([0x845b]); // ideographic variation selector
  });

  it('reduces an emoji family to the emoji a font must actually have', () => {
    expect(cps('👨‍👩‍👧')).toEqual([0x1f468, 0x1f469, 0x1f467]);
  });

  it('keeps combining marks, which are real glyphs a font can be missing', () => {
    expect(cps('é')).toEqual([0x65, 0x301]);
  });

  it('has nothing to ask about empty or blank input', () => {
    expect(requiredCharacters('')).toEqual([]);
    expect(requiredCharacters('\n\n')).toEqual([]);
  });
});

describe('isIgnorable', () => {
  it('separates the invisible from the drawn', () => {
    expect(isIgnorable(0x0a)).toBe(true);
    expect(isIgnorable(0x200d)).toBe(true);
    expect(isIgnorable(0x20)).toBe(false);
    expect(isIgnorable(0x41)).toBe(false);
    expect(isIgnorable(0x20b9)).toBe(false);
  });
});

describe('codepointLabel', () => {
  it('writes the code point the way the Unicode charts do', () => {
    expect(codepointLabel(0x41)).toBe('U+0041');
    expect(codepointLabel(0x20b9)).toBe('U+20B9');
    expect(codepointLabel(0x1f600)).toBe('U+1F600');
  });
});
