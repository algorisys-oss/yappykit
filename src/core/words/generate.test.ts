import { describe, it, expect, vi } from 'vitest';
import {
  unbiasedInt, cryptoRandom, seededRandom, sample, createDealer, filterWords,
  entropyBits, crackTime, passphrase, makeSeed, normalizeSeed,
  PASSPHRASE_POOL, type Random,
} from './generate';
import { ALL_WORDS, CONCRETE_NOUNS } from './corpus';

/** A Random that hands back a scripted sequence, for exact-behaviour tests. */
function scripted(values: number[]): Random {
  let i = 0;
  return { int: () => values[i++ % values.length]! };
}

describe('unbiasedInt', () => {
  it('discards the values that would bias the result', () => {
    // For max = 3 the usable range ends at 4294967295, so that value must be
    // thrown away rather than folded back onto 0 as `% 3` would do.
    const feed = [4294967295, 7];
    let i = 0;
    expect(unbiasedInt(3, () => feed[i++]!)).toBe(1);
    expect(i, 'should have drawn twice, rejecting the first').toBe(2);
  });

  it('keeps a value inside the usable range', () => {
    expect(unbiasedInt(10, () => 42)).toBe(2);
  });

  it('needs no randomness for a single-item range', () => {
    const next = vi.fn(() => 0);
    expect(unbiasedInt(1, next)).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a range that is not a positive integer', () => {
    expect(() => unbiasedInt(0, () => 1)).toThrow(RangeError);
    expect(() => unbiasedInt(-3, () => 1)).toThrow(RangeError);
    expect(() => unbiasedInt(2.5, () => 1)).toThrow(RangeError);
  });

  it('is uniform across the range', () => {
    // A modulo-biased implementation skews this noticeably; an unbiased one
    // stays within a few percent of even over this many draws.
    const rnd = cryptoRandom();
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[rnd.int(7)]++;
    for (const c of counts) expect(c).toBeGreaterThan(9_000);
  });
});

describe('cryptoRandom', () => {
  it('stays inside the range', () => {
    const rnd = cryptoRandom();
    for (let i = 0; i < 1000; i++) {
      const v = rnd.int(13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(13);
    }
  });

  it('draws from the platform CSPRNG, not Math.random', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const mathRandom = vi.spyOn(Math, 'random');
    cryptoRandom().int(100);
    expect(spy).toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    spy.mockRestore();
    mathRandom.mockRestore();
  });
});

describe('seededRandom', () => {
  it('repeats exactly for the same seed', () => {
    const a = Array.from({ length: 20 }, () => seededRandom('picnic').int(1000));
    const b = Array.from({ length: 20 }, () => seededRandom('picnic').int(1000));
    expect(a).toEqual(b);
  });

  it('gives a different sequence for a different seed', () => {
    const a = sample(ALL_WORDS, 10, seededRandom('kq7mn3'));
    const b = sample(ALL_WORDS, 10, seededRandom('kq7mn4'));
    expect(a).not.toEqual(b);
  });

  it('diverges immediately for seeds that differ by one character', () => {
    // Without the warm-up discard, sfc32 opens with near-identical output for
    // near-identical seeds, which would show up as "game1" and "game2" sharing
    // their first word.
    const first = (seed: string) => sample(ALL_WORDS, 1, seededRandom(seed))[0];
    const words = new Set(['game1', 'game2', 'game3', 'game4', 'game5'].map(first));
    expect(words.size).toBe(5);
  });
});

describe('sample', () => {
  it('never repeats an item', () => {
    const picked = sample(ALL_WORDS, 200, cryptoRandom());
    expect(new Set(picked).size).toBe(200);
  });

  it('returns a full permutation when asked for everything', () => {
    const all = sample(ALL_WORDS, ALL_WORDS.length, cryptoRandom());
    expect(all).toHaveLength(ALL_WORDS.length);
    expect(new Set(all)).toEqual(new Set(ALL_WORDS));
  });

  it('clamps to the pool instead of padding or looping', () => {
    expect(sample(['a', 'b'], 99, cryptoRandom())).toHaveLength(2);
  });

  it('returns nothing for a non-positive count', () => {
    expect(sample(ALL_WORDS, 0, cryptoRandom())).toEqual([]);
    expect(sample(ALL_WORDS, -5, cryptoRandom())).toEqual([]);
  });

  it('draws in the order the source dictates', () => {
    // Scripted picks: index 2 of 4, then index 0 of the remaining 3.
    expect(sample(['w', 'x', 'y', 'z'], 2, scripted([2, 0]))).toEqual(['y', 'x']);
  });
});

describe('createDealer', () => {
  it('deals every word once before any word comes round again', () => {
    const pool = CONCRETE_NOUNS.slice(0, 40);
    const dealer = createDealer(pool, cryptoRandom());
    const dealt = Array.from({ length: 40 }, () => dealer.next());
    expect(new Set(dealt).size).toBe(40);
  });

  it('reshuffles rather than running dry', () => {
    const dealer = createDealer(['one', 'two'], cryptoRandom());
    const dealt = Array.from({ length: 6 }, () => dealer.next());
    expect(dealt.every((word) => word !== null)).toBe(true);
  });

  it('reports what is left in the deck', () => {
    const dealer = createDealer(['a', 'b', 'c'], cryptoRandom());
    expect(dealer.remaining()).toBe(3);
    dealer.next();
    expect(dealer.remaining()).toBe(2);
    dealer.reset();
    expect(dealer.remaining()).toBe(3);
  });
});

describe('filterWords', () => {
  it('filters by first letter, last letter and substring', () => {
    expect(filterWords(['apple', 'ant', 'bear'], { startsWith: 'a' })).toEqual(['apple', 'ant']);
    expect(filterWords(['apple', 'ant', 'bear'], { endsWith: 'r' })).toEqual(['bear']);
    expect(filterWords(['apple', 'ant', 'bear'], { contains: 'ea' })).toEqual(['bear']);
  });

  it('filters by length', () => {
    expect(filterWords(['ox', 'cat', 'zebra'], { minLength: 3 })).toEqual(['cat', 'zebra']);
    expect(filterWords(['ox', 'cat', 'zebra'], { maxLength: 3 })).toEqual(['ox', 'cat']);
  });

  it('ignores blank fields rather than matching everything against an empty string', () => {
    expect(filterWords(['cat', 'dog'], { startsWith: '   ', endsWith: '' })).toEqual(['cat', 'dog']);
  });

  it('is case-insensitive about what the user typed', () => {
    expect(filterWords(['cat', 'dog'], { startsWith: 'C' })).toEqual(['cat']);
  });
});

describe('entropyBits', () => {
  it('is log2 of the pool, per word', () => {
    expect(entropyBits(1024, 1)).toBeCloseTo(10);
    expect(entropyBits(1024, 6)).toBeCloseTo(60);
  });

  it('is zero when there is nothing to choose between', () => {
    expect(entropyBits(1, 6)).toBe(0);
    expect(entropyBits(1024, 0)).toBe(0);
  });
});

describe('crackTime', () => {
  it('reports an average search, which is half the keyspace', () => {
    // At one guess per keyspace-second the full search is two seconds, so a
    // correct average-case figure is one.
    expect(crackTime(61, 2 ** 60)).toEqual({ unit: 'second', value: 1 });
  });

  it('walks up through the units as bits are added', () => {
    const units = [30, 45, 55, 62, 64, 70, 80, 140].map((b) => crackTime(b).unit);
    expect(units).toEqual([
      'instant', 'second', 'hour', 'day', 'month', 'year', 'year', 'beyond',
    ]);
  });

  it('names units Intl.NumberFormat can render, so plurals are the platform’s job', () => {
    const { unit, value } = crackTime(72);
    expect(new Intl.NumberFormat('ru', { style: 'unit', unit, unitDisplay: 'long' }).format(value))
      .toMatch(/лет|года|год/);
  });

  it('rounds large figures to something a person can read', () => {
    // Not 19,637,412 years.
    expect(crackTime(90).value % 1000).toBe(0);
  });

  it('gives up rather than printing an absurd number', () => {
    expect(crackTime(2000)).toEqual({ unit: 'beyond', value: 0 });
  });

  it('scales with the attacker assumption', () => {
    expect(crackTime(60, 1e3).unit).not.toBe(crackTime(60, 1e12).unit);
  });
});

describe('passphrase', () => {
  it('produces the requested number of distinct words', () => {
    const p = passphrase({ count: 6, separator: '-' });
    expect(p.words).toHaveLength(6);
    expect(new Set(p.words).size).toBe(6);
    expect(p.text.split('-')).toHaveLength(6);
  });

  it('reports the entropy of the pool it actually drew from', () => {
    const p = passphrase({ count: 6, separator: '-' });
    expect(p.poolSize).toBe(PASSPHRASE_POOL.length);
    expect(p.bits).toBeCloseTo(6 * Math.log2(PASSPHRASE_POOL.length));
  });

  it('capitalises and appends a digit on request', () => {
    const p = passphrase({ count: 4, separator: '.', capitalize: true, addNumber: true });
    expect(p.words.every((word) => /^[A-Z]/.test(word))).toBe(true);
    expect(p.text).toMatch(/^([A-Z][a-z]+\.){3}[A-Z][a-z]+[0-9]$/);
  });

  it('does not count the appended digit towards the quoted strength', () => {
    const plain = passphrase({ count: 5, separator: '-' });
    const withDigit = passphrase({ count: 5, separator: '-', addNumber: true });
    expect(withDigit.bits).toBe(plain.bits);
  });

  it('cannot be made reproducible: it always uses the CSPRNG', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const a = passphrase({ count: 8, separator: '-' });
    const b = passphrase({ count: 8, separator: '-' });
    expect(spy).toHaveBeenCalled();
    expect(a.text).not.toBe(b.text);
    spy.mockRestore();
  });

  it('draws only from words short enough to type from memory', () => {
    expect(PASSPHRASE_POOL.every((word) => word.length >= 3 && word.length <= 8)).toBe(true);
    expect(PASSPHRASE_POOL.length).toBeGreaterThan(1000);
  });

  it('clamps an absurd word count instead of hanging', () => {
    expect(passphrase({ count: 500, separator: '-' }).words).toHaveLength(24);
    expect(passphrase({ count: 0, separator: '-' }).words).toHaveLength(1);
  });
});

describe('seeds', () => {
  it('uses only characters that survive being read aloud', () => {
    for (let i = 0; i < 200; i++) expect(makeSeed()).toMatch(/^[a-hjkmnp-z2-9]{6}$/);
  });

  it('folds the ways a person might retype a code', () => {
    expect(normalizeSeed('  KQ7-MN3 ')).toBe('kq7mn3');
  });

  it('leaves a seed someone chose themselves intact', () => {
    expect(normalizeSeed('Lion')).toBe('lion');
  });
});
