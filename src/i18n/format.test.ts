import { describe, it, expect } from 'vitest';
import { fmt, parts } from './format';

describe('fmt', () => {
  it('substitutes tokens', () => {
    expect(fmt('Done: {size}.', { size: '97 KB' })).toBe('Done: 97 KB.');
  });

  it('substitutes the same token more than once', () => {
    expect(fmt('{a} and {a}', { a: 'x' })).toBe('x and x');
  });

  it('leaves an unknown token visible rather than blanking it', () => {
    expect(fmt('Hi {name}', {})).toBe('Hi {name}');
  });

  it('accepts numbers', () => {
    expect(fmt('{n} passes', { n: 7 })).toBe('7 passes');
  });
});

describe('parts', () => {
  it('splits around a token', () => {
    expect(parts('see our {privacy} page')).toEqual([
      { text: 'see our ' },
      { token: 'privacy' },
      { text: ' page' },
    ]);
  });

  it('handles a token at each end', () => {
    expect(parts('{a} mid {b}')).toEqual([
      { token: 'a' },
      { text: ' mid ' },
      { token: 'b' },
    ]);
  });

  it('returns a single text part when there are no tokens', () => {
    expect(parts('plain')).toEqual([{ text: 'plain' }]);
  });

  it('preserves translator-chosen token order', () => {
    // German moves the link; the component must not assume English order.
    expect(parts('{privacy} finden Sie hier').map((p) => ('token' in p ? p.token : p.text))).toEqual(
      ['privacy', ' finden Sie hier'],
    );
  });
});
