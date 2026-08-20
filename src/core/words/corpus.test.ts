import { describe, it, expect } from 'vitest';
import {
  ALL_WORDS, CONCRETE_NOUNS, ABSTRACT_NOUNS, ACTION_VERBS, ADJECTIVES,
} from './corpus';

/**
 * The corpus is data, and data rots silently. These are the invariants the
 * generator's honesty depends on — particularly uniqueness, which the reported
 * entropy is computed from.
 */
describe('corpus', () => {
  it('never lists a word twice, in one list or across them', () => {
    const seen = new Map<string, number>();
    for (const word of ALL_WORDS) seen.set(word, (seen.get(word) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([word]) => word);
    expect(dupes, 'a duplicate doubles that word’s odds and inflates the entropy').toEqual([]);
  });

  it('holds only plain lowercase words', () => {
    const bad = ALL_WORDS.filter((word) => !/^[a-z]{3,}$/.test(word));
    expect(bad, 'no capitals, digits, spaces, hyphens or two-letter words').toEqual([]);
  });

  it('is large enough for the passphrase entropy to be worth quoting', () => {
    expect(ALL_WORDS.length).toBeGreaterThan(1200);
  });

  it('keeps every list usefully stocked', () => {
    expect(CONCRETE_NOUNS.length).toBeGreaterThan(700);
    expect(ABSTRACT_NOUNS.length).toBeGreaterThan(100);
    expect(ACTION_VERBS.length).toBeGreaterThan(150);
    expect(ADJECTIVES.length).toBeGreaterThan(150);
  });

  it('keeps abstractions out of the lists the drawing games use', () => {
    const abstract = new Set(ABSTRACT_NOUNS);
    expect(CONCRETE_NOUNS.filter((word) => abstract.has(word))).toEqual([]);
  });

  it('stays short enough to draw and to spell', () => {
    // A word nobody can spell from hearing it is a bad passphrase word and a
    // worse charades card.
    const long = ALL_WORDS.filter((word) => word.length > 13);
    expect(long).toEqual([]);
  });
});
