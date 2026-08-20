/**
 * Random word generation — sampling, entropy and the shareable seed.
 *
 * Three things here are done differently from the tools this competes with, and
 * all three are correctness matters rather than features:
 *
 * 1. THE RANDOMNESS IS UNBIASED. Everyone reaches for
 *    `Math.floor(Math.random() * n)`. Math.random is not uniform enough to build
 *    a passphrase on, and the obvious crypto version, `getRandomValues() % n`,
 *    has modulo bias: unless n divides 2^32 exactly, the low words come up more
 *    often. We reject the short tail instead (`unbiasedInt`), so every word is
 *    genuinely equally likely and the entropy figure below is the true one.
 *
 * 2. A DRAW NEVER REPEATS. Words are dealt without replacement, so a Pictionary
 *    round cannot hand out "elephant" twice, and a passphrase cannot contain the
 *    same word twice (which would be weaker than the arithmetic suggests).
 *
 * 3. THE ENTROPY IS COMPUTED FROM THE POOL WE ACTUALLY DREW FROM. Filter the
 *    list down to words starting with "s" and the strength drops; sites that
 *    quote a fixed "77 bits" regardless of settings are quoting a number they no
 *    longer have.
 */
import { ALL_WORDS } from './corpus';

/** A source of uniform integers. The seam that lets a draw be seeded or not. */
export interface Random {
  /** A uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/**
 * Uniform integer from a raw 32-bit source, by rejection.
 *
 * The naive `next32() % max` favours the first `2^32 % max` values. Discarding
 * the incomplete final block removes that bias entirely, at the cost of an
 * occasional extra draw — for the pool sizes here, a rejection is rarer than one
 * in ten million.
 */
export function unbiasedInt(maxExclusive: number, next32: () => number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let v = next32();
  while (v >= limit) v = next32();
  return v % maxExclusive;
}

/** Cryptographic randomness, buffered so a 10-word draw is not 10 syscalls. */
export function cryptoRandom(): Random {
  const buf = new Uint32Array(64);
  let i = buf.length;
  const next32 = () => {
    if (i >= buf.length) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++]!;
  };
  return { int: (max) => unbiasedInt(max, next32) };
}

/** Hash a seed string to four 32-bit values (cyrb128). */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/**
 * Deterministic randomness from a seed string (sfc32).
 *
 * This exists so a draw can be SHARED: a teacher sends one code and thirty
 * pupils get the same twenty words, with no account, no server and no link
 * shortener. It is emphatically not for passphrases, which is why `passphrase()`
 * below cannot be handed one.
 */
export function seededRandom(seed: string): Random {
  let [a, b, c, d] = hashSeed(seed);
  const next32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  // Discard the first few outputs: sfc32 is weakly mixed immediately after
  // seeding, and similar seeds ("game1", "game2") would otherwise open with
  // suspiciously similar words.
  for (let i = 0; i < 12; i++) next32();
  return { int: (max) => unbiasedInt(max, next32) };
}

/**
 * Deal `count` distinct items, in random order.
 *
 * Partial Fisher-Yates over an index array: correct without replacement, and it
 * does not shuffle 1389 words to draw three.
 */
export function sample<T>(items: readonly T[], count: number, rnd: Random): T[] {
  const n = Math.min(Math.max(0, Math.floor(count)), items.length);
  if (n === 0) return [];
  const idx = Array.from({ length: items.length }, (_, i) => i);
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + rnd.int(idx.length - i);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
    out.push(items[idx[i]!]!);
  }
  return out;
}

/**
 * A dealer that never repeats until the pool is exhausted.
 *
 * The card-game behaviour people expect and almost no generator implements:
 * pressing "next word" thirty times in a party game should give thirty
 * different words, not a coin-flip on a repeat every round.
 */
export interface Dealer {
  next(): string | null;
  /** Words left before the deck must be reshuffled. */
  remaining(): number;
  /** Reshuffle and start over. */
  reset(): void;
}

export function createDealer(pool: readonly string[], rnd: Random): Dealer {
  let deck: string[] = [];
  const shuffle = () => {
    deck = sample(pool, pool.length, rnd);
  };
  shuffle();
  return {
    next() {
      if (deck.length === 0) shuffle();
      return deck.pop() ?? null;
    },
    remaining: () => deck.length,
    reset: shuffle,
  };
}

export interface WordFilter {
  startsWith?: string;
  endsWith?: string;
  contains?: string;
  minLength?: number;
  maxLength?: number;
}

/** Apply the letter/length filters. Blank fields are ignored, not treated as ''. */
export function filterWords(words: readonly string[], f: WordFilter): string[] {
  const starts = (f.startsWith ?? '').trim().toLowerCase();
  const ends = (f.endsWith ?? '').trim().toLowerCase();
  const has = (f.contains ?? '').trim().toLowerCase();
  const min = f.minLength ?? 0;
  const max = f.maxLength ?? Infinity;
  return words.filter(
    (word) =>
      word.length >= min &&
      word.length <= max &&
      (!starts || word.startsWith(starts)) &&
      (!ends || word.endsWith(ends)) &&
      (!has || word.includes(has)),
  );
}

/** Shannon entropy of a draw: how many bits a guesser would have to search. */
export function entropyBits(poolSize: number, wordCount: number): number {
  if (poolSize < 2 || wordCount < 1) return 0;
  return wordCount * Math.log2(poolSize);
}

/**
 * Guesses per second assumed for the crack-time estimate.
 *
 * An offline attack on a fast hash with commodity GPUs. It is deliberately
 * pessimistic: quoting the online-attack rate would flatter every passphrase by
 * a factor of a billion, and the point of the figure is to be trusted.
 */
export const OFFLINE_GUESS_RATE = 1e12;

/**
 * Units the estimate is reported in.
 *
 * Deliberately the same spellings `Intl.NumberFormat`'s `style: 'unit'` takes,
 * so the UI can hand the pair straight to the platform and get "88 years",
 * "5 лет" and "11万 年" — correct plurals in every locale we ship — instead of a
 * translated string per unit that would still get Russian's three plural forms
 * wrong.
 */
export type CrackUnit =
  | 'instant' | 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year' | 'beyond';

/**
 * Time to find the passphrase by brute force, as a unit and a count.
 *
 * Halved, because an average search finds the answer halfway through the
 * keyspace. Anything past a quadrillion years is reported as 'beyond' rather
 * than as a number: past that point the figure stops informing the decision and
 * starts sounding like marketing.
 */
export function crackTime(
  bits: number,
  guessesPerSecond: number = OFFLINE_GUESS_RATE,
): { unit: CrackUnit; value: number } {
  const seconds = Math.pow(2, bits - 1) / guessesPerSecond;
  const MINUTE = 60, HOUR = 3600, DAY = 86400, MONTH = 2629800, YEAR = 31557600;
  if (!Number.isFinite(seconds)) return { unit: 'beyond', value: 0 };
  if (seconds < 1) return { unit: 'instant', value: 0 };
  // Three significant figures once the numbers get big: "19,600,000 years" is
  // as much precision as anyone can use, and the spurious digits of the exact
  // value only make it harder to read.
  const tidy = (n: number) => (n >= 1000 ? Number(n.toPrecision(3)) : Math.max(1, Math.round(n)));
  if (seconds < MINUTE) return { unit: 'second', value: tidy(seconds) };
  if (seconds < HOUR) return { unit: 'minute', value: tidy(seconds / MINUTE) };
  if (seconds < DAY) return { unit: 'hour', value: tidy(seconds / HOUR) };
  if (seconds < MONTH) return { unit: 'day', value: tidy(seconds / DAY) };
  if (seconds < YEAR) return { unit: 'month', value: tidy(seconds / MONTH) };
  const years = seconds / YEAR;
  if (years >= 1e15) return { unit: 'beyond', value: 0 };
  return { unit: 'year', value: tidy(years) };
}

/**
 * Words allowed in a passphrase.
 *
 * Capped at eight letters: a passphrase is typed, often on a phone keyboard and
 * often from memory, and "responsibility" costs the same four-and-a-bit bits as
 * "otter" while being far likelier to make someone give up and pick a weak
 * password instead. Three letters minimum for the same reason in reverse — a
 * two-letter word adds nothing a person can hold on to.
 */
export const PASSPHRASE_POOL: readonly string[] = ALL_WORDS.filter(
  (word) => word.length >= 3 && word.length <= 8,
);

export interface Passphrase {
  words: string[];
  text: string;
  bits: number;
  poolSize: number;
}

export interface PassphraseOptions {
  count: number;
  separator: string;
  capitalize?: boolean;
  /** Append a digit 0-9, which some password fields still demand. */
  addNumber?: boolean;
}

/**
 * Generate a passphrase.
 *
 * NOTE THE SIGNATURE: there is no `Random` parameter. Every other draw in this
 * module can be seeded, and a seeded passphrase is a passphrase anyone holding
 * the seed can reproduce. Making it impossible to pass one in is the only way to
 * be sure the share-a-seed feature can never leak into this path.
 *
 * The reported bits cover the words only. A trailing digit does add a little,
 * but the position and the habit are predictable, so counting it would overstate
 * the strength — and this number is the one thing here that must not flatter.
 */
export function passphrase(opts: PassphraseOptions): Passphrase {
  const rnd = cryptoRandom();
  const count = Math.min(Math.max(1, Math.floor(opts.count)), 24);
  const picked = sample(PASSPHRASE_POOL, count, rnd);
  const shown = opts.capitalize
    ? picked.map((word) => word[0]!.toUpperCase() + word.slice(1))
    : picked;
  const joined = shown.join(opts.separator);
  return {
    words: shown,
    text: opts.addNumber ? joined + String(rnd.int(10)) : joined,
    bits: entropyBits(PASSPHRASE_POOL.length, count),
    poolSize: PASSPHRASE_POOL.length,
  };
}

/**
 * Alphabet for shareable seed codes.
 *
 * No 0/O/1/l/I: the code gets read aloud across a classroom or typed off a
 * screenshot, and those four cost more support than the extra bits are worth.
 */
const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A short, unambiguous, shareable code for reproducing a draw. */
export function makeSeed(rnd: Random = cryptoRandom(), length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += SEED_ALPHABET[rnd.int(SEED_ALPHABET.length)];
  return out;
}

/**
 * Normalise a seed typed by a human, so that "KQ7-MN3" and "kq7mn3" are the
 * same draw. Case, spaces and hyphens only: the alphabet above already excludes
 * the lookalike characters, and rewriting them here would quietly turn a seed
 * someone chose themselves ("lion") into a different one.
 */
export function normalizeSeed(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]/g, '');
}
